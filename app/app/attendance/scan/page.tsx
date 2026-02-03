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
  const [tokenError, setTokenError] = useState<{th: string, en: string} | null>(null);
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
                    setTokenError({ th: "ไม่พบโค้ด (โค้ดอาจถูกใช้ไปแล้ว)", en: "Code not found (already used)" });
                    return;
                }
                if (Date.now() > tokenData.expiresAtMs + TOKEN_BUFFER_MS) {
                    setTokenStatus("invalid");
                    setTokenError({ th: "โค้ดหมดอายุ", en: "Code expired" });
                    setTokenExpiresIn(0);
                    return;
                }
                setTokenStatus("valid");
                setTokenExpiresIn(Math.round((tokenData.expiresAtMs - Date.now())/1000));
                setTokenError(null);
                return; 
            } else {
                 setTokenStatus("invalid");
                 setTokenError({ th: "ไม่พบโค้ด (token ไม่เจอในระบบ)", en: "Code not found in system" });
            }
        } catch (error: any) {
            console.error("Kiosk token verification failed:", error?.code, error?.message, error);
            setTokenStatus("invalid");
            setTokenError({ th: "เกิดข้อผิดพลาดในการตรวจสอบโค้ด", en: "An error occurred during verification" });
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

  // REDIRECT EFFECT - Fixed Rule of Hooks
  useEffect(() => {
    if (!recentClock) return;

    const timer = setTimeout(() => {
      if (!profile) {
        router.replace('/login');
        return;
      }

      const { role, department } = profile;

      if (role === 'ADMIN') {
        router.replace('/app/jobs');
      } else if (role === 'OFFICER') {
        if (department === 'CAR_SERVICE') {
          router.replace('/app/car-service/jobs/all');
        } else {
          router.replace('/app/kiosk');
        }
      } else if (role === 'MANAGER' || role === 'WORKER') {
        switch (department) {
          case 'MANAGEMENT': router.replace('/app/management/overview'); break;
          case 'OFFICE': router.replace('/app/office/intake'); break;
          case 'CAR_SERVICE': router.replace('/app/car-service/jobs/all'); break;
          case 'COMMONRAIL': router.replace('/app/commonrail/jobs/all'); break;
          case 'MECHANIC': router.replace('/app/mechanic/jobs/all'); break;
          case 'OUTSOURCE': router.replace('/app/outsource/export/new'); break;
          default: router.replace('/app/jobs'); break;
        }
      } else {
        router.replace('/app/jobs');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [recentClock, router, profile]);

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
        toast({ variant: 'destructive', title: 'Action Denied', description: `เพิ่งลงเวลาไปแล้ว กรุณารออีก ${SPAM_DELAY_SECONDS - secondsSinceLast} วินาที / Please wait another ${SPAM_DELAY_SECONDS - secondsSinceLast}s` });
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

  if (recentClock) {
    return (
       <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
           <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
           <h1 className="text-3xl font-bold">ลงเวลาสำเร็จ!</h1>
           <h2 className="text-xl font-semibold text-muted-foreground">Clock-in Success!</h2>
           <p className="text-muted-foreground mt-4 text-lg">
               คุณได้ลงเวลา <Badge variant={recentClock.type === 'IN' ? 'default' : 'secondary'}>{recentClock.type}</Badge> เรียบร้อยแล้ว
               <br />
               You have successfully clocked <Badge variant={recentClock.type === 'IN' ? 'default' : 'secondary'}>{recentClock.type}</Badge>
           </p>
           <p className="text-xl font-semibold mt-6">{safeFormat(recentClock.time, 'HH:mm:ss')}</p>
           <p className="text-muted-foreground">{profile?.displayName}</p>
           <div className="mt-8 flex items-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecting... กำลังกลับไปหน้าหลัก...
           </div>
       </div>
    );
  }

  if (tokenStatus === "missing") {
      return (
          <>
            <PageHeader 
                title="Scan QR Code / สแกนลงเวลา" 
                description="This page is intended to be opened from a QR code. / หน้านี้สำหรับเปิดจาก QR Code เท่านั้น" 
            />
             <Alert variant="destructive" className="max-w-md mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No QR Code Token / ไม่พบข้อมูลโค้ด</AlertTitle>
                <AlertDescription>
                  Please scan a valid QR code from the Kiosk screen to clock in or out.
                  <br />
                  กรุณาสแกน QR Code ที่ถูกต้องจากหน้าจอ Kiosk เพื่อบันทึกเวลา
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
             <h2 className="text-xl font-semibold text-muted-foreground">Invalid QR Code</h2>
             <p className="font-semibold text-destructive mt-4 text-base">
                {tokenError?.th} / {tokenError?.en}
             </p>
             <p className="text-muted-foreground mt-2 text-sm max-w-md">
                Please try scanning again from the Kiosk screen.
                <br />
                กรุณาลองสแกน QR Code ใหม่จากหน้าจอ Kiosk
             </p>
             {kioskToken && (
                <p className="text-xs text-muted-foreground mt-6 font-mono bg-muted px-2 py-1 rounded">
                    TOKEN: ...{kioskToken.slice(-6)}
                </p>
             )}
         </div>
      )
  }


  return (
    <>
      <PageHeader 
        title="Attendance / ลงเวลา" 
        description="Record your working time. / บันทึกเวลาเข้า-ออกงานของคุณ" 
      />
      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Clock In / Out</CardTitle>
            {isLoading ? (
                <CardDescription>Loading current status...</CardDescription>
            ) : (
                <CardDescription>
                    <span className="block mb-1">Last Status / สถานะล่าสุด:</span>
                    <Badge variant={lastAttendance?.type === 'IN' ? 'default' : 'secondary'}>{lastAttendance?.type || 'No Data / ยังไม่มีข้อมูล'}</Badge> 
                    {lastAttendance ? ` at ${safeFormat(lastAttendance.timestamp, 'HH:mm')}`: ''}
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button 
                size="lg" 
                className="w-full h-24 text-2xl flex-col gap-1" 
                onClick={handleClockAction} 
                disabled={isSubmitting || isLoading || !canClock}
            >
                {isSubmitting || isLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                    <>
                        <div className="flex items-center">
                            {nextAction === 'IN' ? <LogIn className="mr-4 h-8 w-8" /> : <LogOut className="mr-4 h-8 w-8" />}
                            <span>Clock {nextAction} / ลงเวลา{nextAction === 'IN' ? 'เข้า' : 'ออก'}</span>
                        </div>
                    </>
                )}
            </Button>
            {tokenStatus === 'valid' && tokenExpiresIn !== null && (
                <div className="text-xs text-muted-foreground">
                    (Code expires in {tokenExpiresIn}s / โค้ดหมดอายุใน {tokenExpiresIn} วินาที)
                </div>
            )}
            {!isLoading && !canClockSpam && (
                <div className="flex items-center text-sm text-destructive p-3 rounded-md bg-destructive/10">
                    <AlertCircle className="mr-2 h-5 w-5 shrink-0" />
                    <div>
                        Recently clocked. Please wait {SPAM_DELAY_SECONDS - (secondsSinceLast ?? 0)}s.
                        <br />
                        เพิ่งลงเวลาไปแล้ว กรุณารออีก {SPAM_DELAY_SECONDS - (secondsSinceLast ?? 0)} วินาที
                    </div>
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
