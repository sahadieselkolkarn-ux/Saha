
"use client";

import { Suspense, useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, serverTimestamp, Timestamp, writeBatch, doc, getDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

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
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // States for token-based clock-in
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("verifying");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenExpiresIn, setTokenExpiresIn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<LastAttendanceInfo | null | undefined>(undefined);
  const [recentClock, setRecentClock] = useState<{type: 'IN' | 'OUT', time: Date} | null>(null);
  const [secondsSinceLast, setSecondsSinceLast] = useState<number | null>(null);

  // Helper to wait for video metadata to be ready
  async function waitForVideoReady(video: HTMLVideoElement) {
    for (let i = 0; i < 60; i++) { // Approx 6 seconds timeout
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Camera ready timeout");
  }

  // Handler for when a QR is successfully scanned
  const handleScannedText = useCallback((text: string) => {
    controlsRef.current?.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    setIsScanning(false);
    
    if (text.includes('/app/attendance/scan')) {
      router.push(text);
    } else {
      toast({ variant: 'destructive', title: 'Invalid QR Code', description: 'This QR code is not for attendance.' });
      setTimeout(() => {
        if (!document.hidden) {
          router.replace('/app/attendance/scan');
        }
      }, 2000);
    }
  }, [router, toast]);
  
  // Core scanning function
  const startScan = useCallback(async () => {
    // 1. Cleanup previous scan session
    if (controlsRef.current) {
        try { controlsRef.current.stop(); } catch(e) { console.warn("Failed to stop previous controls", e); }
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
    }

    setIsScanning(true);
    setScannerError(null);

    try {
        // List devices if not already done
        if (devices.length === 0) {
            let videoInputDevices: MediaDeviceInfo[] = [];
            try {
                if (typeof BrowserMultiFormatReader.listVideoInputDevices === 'function') {
                    videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
                } else if (navigator.mediaDevices?.enumerateDevices) {
                    const allDevices = await navigator.mediaDevices.enumerateDevices();
                    videoInputDevices = allDevices.filter(d => d.kind === 'videoinput');
                }
            } catch (e) {
                console.warn("Could not list video devices", e);
            }
            setDevices(videoInputDevices);
            if (videoInputDevices.length > 0 && !selectedDeviceId) {
                const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back'));
                setSelectedDeviceId(backCamera?.deviceId || videoInputDevices[0].deviceId);
            }
        }
        
        const deviceId = selectedDeviceId || (devices.length > 0 ? devices[0].deviceId : undefined);

        // 2. Open camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
            audio: false
        });
        streamRef.current = stream;
        setHasPermission(true);

        // 3. Attach to video element and play
        const videoElement = videoRef.current;
        if (!videoElement) throw new Error("Video element is not available.");
        
        videoElement.srcObject = stream;
        await videoElement.play();
        await waitForVideoReady(videoElement);

        // 4. Start ZXing decoding
        if (!readerRef.current) {
            readerRef.current = new BrowserMultiFormatReader();
        }
        const reader = readerRef.current;
        
        const newControls = await reader.decodeFromVideoElement(videoElement, (result, error) => {
            if (result) {
                handleScannedText(result.getText());
            }
            const errName = (error as any)?.name;
            const errMsg = String((error as any)?.message ?? "").toLowerCase();
            const isNotFound = errName === "NotFoundException" || errMsg.includes("notfound") || errMsg.includes("not found");

            if (error && !isNotFound) {
                console.error("QR decode error:", error);
            }
        });
        controlsRef.current = newControls;

    } catch (err: any) {
        console.error("Failed to start scanner:", err);
        setScannerError(err.message || "An unexpected error occurred during camera setup.");
        if (err.name === 'NotAllowedError') {
          setHasPermission(false);
          setScannerError("Camera access was denied. Please enable it in your browser settings.");
        }
        setIsScanning(false);
    }
  }, [selectedDeviceId, handleScannedText, devices]);

  // Main effect to manage the scanner lifecycle
  useEffect(() => {
    if (kioskToken) {
      if (controlsRef.current) controlsRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      return;
    }
    
    startScan();

    return () => {
      if (controlsRef.current) try { controlsRef.current.stop(); } catch(e) {}
      if (readerRef.current) try { readerRef.current.reset(); } catch(e) {}
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [kioskToken, startScan]);
  
  // --- Token and Clock-in Logic (remains mostly the same) ---
  useEffect(() => {
    if (!kioskToken) {
        setTokenStatus("missing");
        return;
    }

    async function verifyToken() {
      if (!db) return;
      setTokenStatus("verifying");
      setTokenError(null);
      
      const tokenRef = doc(db, "kioskTokens", kioskToken!);
      try {
            const tokenSnap = await getDoc(tokenRef);
            if (!tokenSnap.exists()) {
                setTokenStatus("invalid");
                setTokenError("ไม่พบโค้ด (token ไม่เจอในระบบ)");
                return;
            }
            const tokenData = tokenSnap.data() as KioskToken;
            if (!tokenData.isActive) {
                setTokenStatus("invalid");
                setTokenError("โค้ดนี้ถูกใช้ไปแล้ว");
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
        } catch (error: any) {
            setTokenStatus("invalid");
            setTokenError("เกิดข้อผิดพลาดในการตรวจสอบโค้ด");
        }
    }
    verifyToken();
  }, [kioskToken, db]);
  
  useEffect(() => {
    if (tokenStatus !== 'valid' || tokenExpiresIn === null || tokenExpiresIn <= 0) return;
    const timer = setInterval(() => setTokenExpiresIn(prev => Math.max(0, (prev || 0) - 1)), 1000);
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
      if (lastAtt.timestamp?.toDate) {
        setSecondsSinceLast(differenceInSeconds(new Date(), lastAtt.timestamp.toDate()));
      }
    } else {
      setLastAttendance(null);
      setSecondsSinceLast(null);
    }
  }, [profile, authLoading]);
  
  useEffect(() => {
    if (secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS) return;
    const timer = setInterval(() => setSecondsSinceLast(prev => (prev !== null ? prev + 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [secondsSinceLast]);

  const handleClockAction = async () => {
    if (!db || !profile || lastAttendance === undefined || tokenStatus !== 'valid') return;
    
    if (secondsSinceLast !== null && secondsSinceLast <= SPAM_DELAY_SECONDS) {
        toast({ variant: 'destructive', title: 'Action Denied', description: `เพิ่งลงเวลาไปแล้ว กรุณารออีก ${SPAM_DELAY_SECONDS - secondsSinceLast} วินาที` });
        return;
    }

    setIsSubmitting(true);
    const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';

    try {
      const batch = writeBatch(db);
      const newAttendanceRef = doc(collection(db, 'attendance'));
      batch.set(newAttendanceRef, { userId: profile.uid, userName: profile.displayName, type: nextAction, timestamp: serverTimestamp(), id: newAttendanceRef.id });
      
      const userDocRef = doc(db, 'users', profile.uid);
      batch.update(userDocRef, { lastAttendance: { type: nextAction, timestamp: serverTimestamp() } });

      if (kioskToken) {
        const tokenRef = doc(db, "kioskTokens", kioskToken);
        batch.update(tokenRef, { isActive: false });
      }
      
      await batch.commit();
      setRecentClock({ type: nextAction, time: new Date() });
    } catch (error: any) {
      toast({ variant: 'destructive', title: `Failed to Clock ${nextAction}`, description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER LOGIC ---

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
                          <div className="h-full w-full bg-red-500/70 shadow-[0_0_10px_red] animate-[scan_2s_ease-in-out_infinite]" style={{ animationName: 'scan' }}/>
                          <style jsx>{`@keyframes scan { 0%, 100% { transform: translateY(-128px); } 50% { transform: translateY(128px); }}`}</style>
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
                  <Button variant="link" onClick={() => startScan()} className="p-0 h-auto ml-2">Retry</Button>
                </AlertDescription>
              </Alert>
            )}

          {hasPermission && devices.length > 1 && (
            <div className="flex gap-2 items-center max-w-md w-full">
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select Camera" /></SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${devices.indexOf(device) + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </>
    );
  }

  // --- RENDER LOGIC for token-based clock-in ---
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
             <Button onClick={() => router.replace('/app/attendance/scan')} className="mt-8">สแกนอีกครั้ง</Button>
         </div>
      )
  }
  
  if (tokenStatus === 'invalid') {
       return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
             <ShieldX className="h-16 w-16 text-destructive mb-4" />
             <h1 className="text-3xl font-bold">QR Code ใช้งานไม่ได้</h1>
             <p className="font-semibold text-destructive mt-2 text-base">{tokenError || 'QR Code ไม่ถูกต้อง'}</p>
             <p className="text-muted-foreground mt-1 text-sm max-w-md">กรุณาลองสแกน QR Code ใหม่จากหน้าจอ Kiosk</p>
             <Button onClick={() => router.push('/app/attendance/scan')} variant="outline" className="mt-6">
                <RefreshCw className="mr-2 h-4 w-4"/> ลองสแกนใหม่
             </Button>
         </div>
      )
  }

  const isLoading = lastAttendance === undefined || authLoading || tokenStatus === "verifying";
  const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';
  const canClockSpam = secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS;
  const canClock = tokenStatus === 'valid' && canClockSpam;

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
            <Button size="lg" className="w-full h-20 text-2xl" onClick={handleClockAction} disabled={isSubmitting || isLoading || !canClock}>
                {isSubmitting || isLoading ? (<Loader2 className="h-8 w-8 animate-spin" />) : (<>{nextAction === 'IN' ? <LogIn className="mr-4 h-8 w-8" /> : <LogOut className="mr-4 h-8 w-8" />} ลงเวลา{nextAction === 'IN' ? 'เข้า' : 'ออก'}</>)}
            </Button>
            {tokenStatus === 'valid' && tokenExpiresIn !== null && (<div className="text-xs text-muted-foreground">(Code expires in {tokenExpiresIn}s)</div>)}
            {!isLoading && !canClockSpam && (<div className="flex items-center text-sm text-destructive p-2 rounded-md bg-destructive/10"><AlertCircle className="mr-2 h-4 w-4" /> เพิ่งลงเวลาไปแล้ว. กรุณารออีก {SPAM_DELAY_SECONDS - (secondsSinceLast ?? 0)} วินาที</div>)}
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
