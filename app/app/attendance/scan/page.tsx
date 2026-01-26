

"use client";

import { Suspense, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, serverTimestamp, Timestamp, writeBatch, doc, getDoc } from 'firebase/firestore';

import { useFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { differenceInSeconds } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';
import { TOKEN_BUFFER_MS } from '@/lib/constants';
import type { KioskToken } from '@/lib/types';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, LogOut, CheckCircle, AlertCircle, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

  // States for token-based clock-in
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(kioskToken ? "verifying" : "missing");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenExpiresIn, setTokenExpiresIn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<LastAttendanceInfo | null | undefined>(undefined);
  const [recentClock, setRecentClock] = useState<{type: 'IN' | 'OUT', time: Date} | null>(null);
  const [secondsSinceLast, setSecondsSinceLast] = useState<number | null>(null);
  
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
      
      let redirectPath = "/app/jobs";
        if (profile.role === "ADMIN" || profile.department === "MANAGEMENT") {
            redirectPath = "/app/management/jobs";
        } else if (profile.department === "OFFICE") {
            redirectPath = "/app/office/jobs/management";
        }
      router.replace(redirectPath);

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

  if (tokenStatus === "missing") {
      return (
          <>
            <PageHeader title="Scan QR Code" description="This page is intended to be opened from a QR code." />
             <Alert variant="destructive" className="max-w-md mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No QR Code Token</AlertTitle>
                <AlertDescription>
                  Please scan a valid QR code from the Kiosk screen to clock in or out.
                </AlertDescription>
              </Alert>
          </>
      )
  }

  // --- Logic for when token IS present ---
  const isLoading = lastAttendance === undefined || authLoading || tokenStatus === "verifying";
  const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';
  const canClockSpam = secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS;
  const canClock = tokenStatus === 'valid' && canClockSpam;
  
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
      <PageHeader title="ลงเวลา" description="บันทึกเวลาเข้า-ออกงานของคุณ" />
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

// Main export
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

