"use client";

import { Suspense, useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, serverTimestamp, Timestamp, writeBatch, doc, getDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls, NotFoundException } from '@zxing/browser';

import { useFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { differenceInSeconds } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';
import { TOKEN_BUFFER_MS } from '@/lib/constants';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, LogOut, CheckCircle, AlertCircle, ShieldX, ScanLine, CameraOff, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { KioskToken } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SPAM_DELAY_SECONDS = 60;

interface LastAttendanceInfo {
  type: 'IN' | 'OUT';
  timestamp: Timestamp;
}

type TokenStatus = "verifying" | "valid" | "invalid" | "missing";

function ScanPageContent() {
  const { db } = useFirebase();
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const searchParams = useSearchParams();
  const kioskToken = useMemo(() => searchParams.get('k') || searchParams.get('token'), [searchParams]);

  // States for camera scanning
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [controls, setControls] = useState<IScannerControls | null>(null);

  // States for token-based clock-in
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("verifying");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenExpiresIn, setTokenExpiresIn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<LastAttendanceInfo | null | undefined>(undefined);
  const [recentClock, setRecentClock] = useState<{type: 'IN' | 'OUT', time: Date} | null>(null);
  const [secondsSinceLast, setSecondsSinceLast] = useState<number | null>(null);

  const resetScanner = useCallback(() => {
    try {
      if (controls) {
        controls.stop();
        setControls(null);
      }
    } catch (e) {
      console.warn("Error stopping scanner controls:", e);
    }
    
    try {
      if (readerRef.current && typeof readerRef.current.reset === 'function') {
        readerRef.current.reset();
      }
    } catch (e) {
      console.warn("Error resetting scanner reader:", e);
    }
  }, [controls]);

  // Effect for camera scanning when no token is present
  useEffect(() => {
    if (kioskToken) return;

    const startScan = async () => {
        setIsScanning(true);
        setScannerError(null);
        try {
            // Get permissions and stream to show the user a preview
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play(); // Ensure video starts playing
            }

            setHasPermission(true);

            // Now list devices
            if (!readerRef.current) {
                readerRef.current = new BrowserMultiFormatReader();
            }
            const videoInputDevices = await readerRef.current.listVideoInputDevices();
            setDevices(videoInputDevices);

            if (videoInputDevices.length > 0) {
                setSelectedDeviceId(videoInputDevices[0].deviceId);
            }

        } catch (err: any) {
            setHasPermission(false);
            if (err.name === 'NotAllowedError') {
                setScannerError("Camera access was denied. Please enable it in your browser settings.");
            } else if (err.name === 'NotFoundError') {
                setScannerError("No camera found. Please ensure a camera is connected.");
            } else if (err.name === 'NotReadableError') {
                setScannerError("Camera is already in use by another application.");
            }
            else {
                setScannerError(`An unexpected error occurred: ${err.name}`);
            }
            console.error("Camera access error:", err);
        }
    };
    
    startScan();

    return () => {
        resetScanner();
        // Also stop the preview stream tracks
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [kioskToken, resetScanner]);

  useEffect(() => {
    if (!selectedDeviceId || !videoRef.current || kioskToken) return;
    
    if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
    }
    const reader = readerRef.current;
    let isCancelled = false;

    const startDecoding = async () => {
        setIsScanning(true);
        try {
            const newControls = await reader.decodeFromVideoElement(
                videoRef.current,
                (result, error, innerControls) => {
                    if (isCancelled || !result) return;
                    
                    isCancelled = true;
                    innerControls.stop();
                    setControls(null);
                    setIsScanning(false);
                    const url = result.getText();
                    if (url.includes('/app/attendance/scan')) {
                         router.push(url);
                    } else {
                        toast({variant: 'destructive', title: 'Invalid QR Code', description: 'This QR code is not for attendance.'});
                         setTimeout(() => {
                            if (document.hidden) return; // Don't restart if tab is not visible
                            isCancelled = false;
                            startDecoding();
                        }, 2000);
                    }
                }
            );

            setControls(newControls);

            // Check for torch support
            const stream = newControls.stream;
            const track = stream.getVideoTracks()[0];
            if (track && 'getCapabilities' in track) {
                const capabilities = track.getCapabilities();
                setTorchSupported(!!capabilities.torch);
                if (!capabilities.torch) {
                    setTorchOn(false);
                }
            } else {
                setTorchSupported(false);
            }
        } catch(err) {
            if (err instanceof NotFoundException) {
                console.warn("No QR code found in frame, continuing scan.");
            } else {
                console.error("ZXing decode start error:", err);
                setScannerError("Failed to start scanner with the selected camera.");
            }
        } finally {
            if(!isCancelled) {
              setIsScanning(false);
            }
        }
    };
    
    startDecoding();

    return () => {
      isCancelled = true;
      resetScanner();
    }
  }, [selectedDeviceId, router, toast, kioskToken, resetScanner]);


  const toggleTorch = useCallback(() => {
      if (controls && torchSupported) {
          const newTorchState = !torchOn;
          controls.switchTorch(newTorchState);
          setTorchOn(newTorchState);
      }
  }, [controls, torchOn, torchSupported]);
  
  // Effect for token verification if token exists
  useEffect(() => {
    if (!kioskToken) {
        setTokenStatus("missing");
        return;
    }

    async function verifyToken() {
      if (!db) return;

      setTokenStatus("verifying");
      setTokenError(null);
      setTokenExpiresIn(null);
      
      const tokenRef = doc(db, "kioskTokens", kioskToken!);
      try {
            const tokenSnap = await getDoc(tokenRef);
            if (tokenSnap.exists()) {
                const tokenData = tokenSnap.data() as KioskToken;
                if (!tokenData.isActive) {
                    setTokenStatus("invalid");
                    setTokenError("ไม่พบโค้ด (โค้ดอาจถูกใช้ไปแล้ว)");
                    return;
                }
                if (Date.now() > tokenData.expiresAtMs + TOKEN_BUFFER_MS) {
                    setTokenStatus("invalid");
                    setTokenError("โค้ดหมดอายุ");
                    setTokenExpiresIn(0);
                    return;
                }
                setTokenStatus("valid");
                setTokenExpiresIn(Math.round((tokenData.expiresAtMs - Date.now())/1000));
                setTokenError(null);
                return; 
            } else {
                 setTokenStatus("invalid");
                 setTokenError("ไม่พบโค้ด (token ไม่เจอในระบบ)");
            }
        } catch (error: any) {
            console.error("Kiosk token verification failed:", error?.code, error?.message, error);
            setTokenStatus("invalid");
            setTokenError("เกิดข้อผิดพลาดในการตรวจสอบโค้ด");
        }
    }

    verifyToken();
  }, [kioskToken, db]);
  
  useEffect(() => {
    if (tokenStatus !== 'valid' || tokenExpiresIn === null || tokenExpiresIn <= 0) return;

    const timer = setInterval(() => {
      setTokenExpiresIn(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [tokenStatus, tokenExpiresIn]);
  
  useEffect(() => {
    if (authLoading) {
      setLastAttendance(undefined);
      return;
    }
    
    if (profile?.lastAttendance) {
      const lastAtt = profile.lastAttendance as LastAttendanceInfo;
      setLastAttendance(lastAtt);
      
      const lastTimestamp = lastAtt.timestamp?.toDate();
      if (lastTimestamp) {
        const diff = differenceInSeconds(new Date(), lastTimestamp);
        setSecondsSinceLast(diff);
      }
    } else {
      setLastAttendance(null);
      setSecondsSinceLast(null);
    }
  }, [profile, authLoading]);
  
  useEffect(() => {
    if (secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS) return;
    
    const timer = setInterval(() => {
        setSecondsSinceLast(prev => (prev !== null ? prev + 1 : null));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [secondsSinceLast]);

  const handleClockAction = async () => {
    if (!db || !profile || lastAttendance === undefined) return;
    if (profile.status !== 'ACTIVE') {
        toast({ variant: 'destructive', title: 'Action Denied', description: 'Your account is not active.'});
        return;
    }
    if (tokenStatus !== 'valid') {
        toast({ variant: 'destructive', title: 'Action Denied', description: 'Invalid or expired QR code.'});
        return;
    }

    if (secondsSinceLast !== null && secondsSinceLast <= SPAM_DELAY_SECONDS) {
        toast({ variant: 'destructive', title: 'Action Denied', description: `เพิ่งลงเวลาไปแล้ว กรุณารออีก ${SPAM_DELAY_SECONDS - secondsSinceLast} วินาที` });
        return;
    }

    setIsSubmitting(true);
    const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';
    const clientTime = new Date();
    const serverTime = serverTimestamp();

    try {
      const batch = writeBatch(db);

      const newAttendanceRef = doc(collection(db, 'attendance'));
      batch.set(newAttendanceRef, {
        userId: profile.uid,
        userName: profile.displayName,
        type: nextAction,
        timestamp: serverTime,
        id: newAttendanceRef.id
      });
      
      const userDocRef = doc(db, 'users', profile.uid);
      batch.update(userDocRef, {
        lastAttendance: { type: nextAction, timestamp: serverTime }
      });

      if (kioskToken) {
        const tokenRef = doc(db, "kioskTokens", kioskToken);
        batch.update(tokenRef, { isActive: false });
      }
      
      await batch.commit();

      toast({
        title: `Successfully Clocked ${nextAction}`,
        description: `Your time has been recorded at ${safeFormat(clientTime, 'PPpp')}`,
      });
      setRecentClock({ type: nextAction, time: clientTime });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Failed to Clock ${nextAction}`,
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER LOGIC ---

  // If no token, show scanner UI
  if (!kioskToken) {
    return (
      <>
        <PageHeader title="Scan QR Code" description="Point your camera at the QR code on the Kiosk screen." />
        <div className="flex flex-col items-center gap-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-2">
                <div className="aspect-square w-full bg-muted rounded-xl overflow-hidden flex items-center justify-center relative">
                    <video ref={videoRef} className="w-full h-full object-cover bg-black rounded-xl" autoPlay playsInline muted />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-64 h-64 border-4 border-white/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                    </div>
                    {isScanning && !scannerError && (
                      <div className="absolute inset-x-0 top-1/2 h-1 w-full overflow-hidden pointer-events-none">
                          <div className="h-full w-full bg-red-500/70 shadow-[0_0_10px_red] animate-[scan_2s_ease-in-out_infinite]"
                           style={{ animationName: 'scan' }}/>
                          <style jsx>{`
                              @keyframes scan {
                                  0%, 100% { transform: translateY(-128px); }
                                  50% { transform: translateY(128px); }
                              }
                          `}</style>
                      </div>
                    )}
                </div>
            </CardContent>
          </Card>
          
           {scannerError && (
              <Alert variant="destructive" className="max-w-md">
                <CameraOff className="h-4 w-4" />
                <AlertTitle>Camera Error</AlertTitle>
                <AlertDescription>
                  {scannerError}
                  <Button variant="link" onClick={() => window.location.reload()} className="p-0 h-auto ml-2">Retry</Button>
                </AlertDescription>
              </Alert>
            )}

          {hasPermission && devices.length > 1 && (
            <div className="flex gap-2 items-center max-w-md w-full">
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select Camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${devices.indexOf(device) + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
               {torchSupported && (
                 <Button variant="outline" size="icon" onClick={toggleTorch}>
                    {torchOn ? <ZapOff/> : <Zap/>}
                 </Button>
               )}
            </div>
          )}

        </div>
      </>
    );
  }

  // --- Logic for when token IS present ---
  const isLoading = lastAttendance === undefined || authLoading || tokenStatus === "verifying";
  const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';
  const canClockSpam = secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS;
  const canClock = tokenStatus === 'valid' && canClockSpam;

  if (recentClock) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
             <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
             <h1 className="text-3xl font-bold">ลงเวลาสำเร็จ!</h1>
             <p className="text-muted-foreground mt-2 text-lg">
                 คุณได้ลงเวลา <Badge variant={recentClock.type === 'IN' ? 'default' : 'secondary'}>{recentClock.type}</Badge> เรียบร้อยแล้ว
             </p>
             <p className="text-xl font-semibold mt-4">{safeFormat(recentClock.time, 'HH:mm:ss')}</p>
             <p className="text-muted-foreground">{profile?.displayName}</p>
             <Button onClick={() => setRecentClock(null)} className="mt-8">ลงเวลาอีกครั้ง</Button>
         </div>
      )
  }
  
  if (tokenStatus === 'invalid') {
       return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
             <ShieldX className="h-16 w-16 text-destructive mb-4" />
             <h1 className="text-3xl font-bold">QR Code ใช้งานไม่ได้</h1>
             <p className="font-semibold text-destructive mt-2 text-base">
                {tokenError || 'QR Code ไม่ถูกต้อง'}
             </p>
             <p className="text-muted-foreground mt-1 text-sm max-w-md">
                กรุณาลองสแกน QR Code ใหม่จากหน้าจอ Kiosk
             </p>
             <Button onClick={() => router.push('/app/attendance/scan')} variant="outline" className="mt-6">
                <RefreshCw className="mr-2 h-4 w-4"/>
                ลองสแกนใหม่
             </Button>
             {kioskToken && (
                <p className="text-xs text-muted-foreground mt-4 font-mono bg-muted px-2 py-1 rounded">
                    TOKEN: ...{kioskToken.slice(-6)}
                </p>
             )}
         </div>
      )
  }


  return (
    <>
      <PageHeader title="Scan" description="บันทึกเวลาเข้า-ออกงานของคุณ" />
      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Clock In / Out</CardTitle>
            {isLoading ? (
                <CardDescription>Loading current status...</CardDescription>
            ) : (
                <CardDescription>
                    สถานะล่าสุด: <Badge variant={lastAttendance?.type === 'IN' ? 'default' : 'secondary'}>{lastAttendance?.type || 'ยังไม่มีข้อมูล'}</Badge> 
                    {lastAttendance ? ` at ${safeFormat(lastAttendance.timestamp, 'HH:mm')}`: ''}
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button 
                size="lg" 
                className="w-full h-20 text-2xl" 
                onClick={handleClockAction} 
                disabled={isSubmitting || isLoading || !canClock}
            >
                {isSubmitting || isLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                    <>
                        {nextAction === 'IN' ? <LogIn className="mr-4 h-8 w-8" /> : <LogOut className="mr-4 h-8 w-8" />}
                        ลงเวลา{nextAction === 'IN' ? 'เข้า' : 'ออก'}
                    </>
                )}
            </Button>
            {tokenStatus === 'valid' && tokenExpiresIn !== null && (
                <div className="text-xs text-muted-foreground">
                    (Code expires in {tokenExpiresIn}s)
                </div>
            )}
            {!isLoading && !canClockSpam && (
                <div className="flex items-center text-sm text-destructive p-2 rounded-md bg-destructive/10">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    เพิ่งลงเวลาไปแล้ว. กรุณารออีก {SPAM_DELAY_SECONDS - (secondsSinceLast ?? 0)} วินาที
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function AttendanceScanPage() {
    return (
        <Suspense fallback={
            <div className="flex justify-center items-center h-full">
                <Loader2 className="animate-spin h-8 w-8" />
            </div>
        }>
            <ScanPageContent />
        </Suspense>
    )
}
