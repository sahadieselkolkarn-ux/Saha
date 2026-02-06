"use client";

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, serverTimestamp, writeBatch, doc, getDoc } from 'firebase/firestore';

import { useFirebase } from '@/firebase/client-provider';
import { useAuth } from '@/context/auth-context';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInSeconds } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';
import { TOKEN_BUFFER_MS } from '@/lib/constants';
import type { KioskToken, HRSettings } from '@/lib/types';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Loader2, LogIn, LogOut, CheckCircle, AlertCircle, ShieldX } from 'lucide-react';

const SPAM_DELAY_SECONDS = 60;

type TokenStatus = "verifying" | "valid" | "invalid" | "missing";

function ScanPageContent() {
  const { db } = useFirebase();
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const searchParams = useSearchParams();
  const kioskToken = useMemo(() => searchParams.get('k') || searchParams.get('token'), [searchParams]);

  const hrSettingsRef = useMemo(() => (db ? doc(db, "settings", "hr") : null), [db]);
  const { data: hrSettings } = useDoc<HRSettings>(hrSettingsRef);

  // States
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(kioskToken ? "verifying" : "missing");
  const [tokenError, setTokenError] = useState<{th: string, en: string} | null>(null);
  const [tokenExpiresIn, setTokenExpiresIn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentClock, setRecentClock] = useState<{type: 'IN' | 'OUT', time: Date} | null>(null);
  const [secondsSinceLast, setSecondsSinceLast] = useState<number | null>(null);
  
  // Verify Token
  useEffect(() => {
    if (!kioskToken || !db) return;

    async function verifyToken() {
      setTokenStatus("verifying");
      const tokenRef = doc(db!, "kioskTokens", kioskToken!);
      try {
            const tokenSnap = await getDoc(tokenRef);
            if (tokenSnap.exists()) {
                const tokenData = tokenSnap.data() as KioskToken;
                if (!tokenData.isActive) {
                    setTokenStatus("invalid");
                    setTokenError({ th: "โค้ดถูกใช้งานไปแล้ว", en: "Code already used" });
                    return;
                }
                if (Date.now() > tokenData.expiresAtMs + TOKEN_BUFFER_MS) {
                    setTokenStatus("invalid");
                    setTokenError({ th: "โค้ดหมดอายุ", en: "Code expired" });
                    return;
                }
                setTokenStatus("valid");
                setTokenExpiresIn(Math.round((tokenData.expiresAtMs - Date.now())/1000));
            } else {
                 setTokenStatus("invalid");
                 setTokenError({ th: "ไม่พบโค้ดในระบบ", en: "Code not found" });
            }
        } catch (error) {
            setTokenStatus("invalid");
            setTokenError({ th: "เกิดข้อผิดพลาดในการตรวจสอบ", en: "Verification error" });
        }
    }
    verifyToken();
  }, [kioskToken, db]);
  
  // Countdown Timer
  useEffect(() => {
    if (tokenStatus !== 'valid' || tokenExpiresIn === null || tokenExpiresIn <= 0) return;
    const timer = setInterval(() => {
      setTokenExpiresIn(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [tokenStatus, tokenExpiresIn]);
  
  // Spam Delay Tracking
  useEffect(() => {
    if (authLoading || !profile?.lastAttendance?.timestamp) {
      setSecondsSinceLast(null);
      return;
    }
    const lastTimestamp = profile.lastAttendance.timestamp.toDate();
    const diff = differenceInSeconds(new Date(), lastTimestamp);
    setSecondsSinceLast(diff);
  }, [profile, authLoading]);
  
  useEffect(() => {
    if (secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS) return;
    const timer = setInterval(() => setSecondsSinceLast(prev => (prev !== null ? prev + 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [secondsSinceLast]);

  // Handle Clock Logic
  const handleClockAction = async () => {
    if (!db || !profile || authLoading) return;
    
    if (profile.status !== 'ACTIVE') {
        toast({ variant: 'destructive', title: 'การเข้าถึงถูกปฏิเสธ', description: 'บัญชีของคุณไม่ได้อยู่ในสถานะที่ใช้งานได้'});
        return;
    }
    if (tokenStatus !== 'valid') {
        toast({ variant: 'destructive', title: 'การเข้าถึงถูกปฏิเสธ', description: 'QR Code ไม่ถูกต้องหรือหมดอายุ'});
        return;
    }
    if (secondsSinceLast !== null && secondsSinceLast <= SPAM_DELAY_SECONDS) {
        toast({ variant: 'destructive', title: 'กดย้ำเกินไป', description: `กรุณารออีก ${SPAM_DELAY_SECONDS - secondsSinceLast} วินาที` });
        return;
    }

    const now = new Date();
    const todayKey = format(now, 'yyyy-MM-dd');
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    const cutoffStr = hrSettings?.afternoonCutoffTime || '12:00';
    const [cutoffH, cutoffM] = cutoffStr.split(':').map(Number);
    const cutoffMinutes = cutoffH * 60 + cutoffM;

    // Decision: Based strictly on time
    const actionType: 'IN' | 'OUT' = nowMinutes < cutoffMinutes ? 'IN' : 'OUT';
    
    const lastDateKey = profile.lastAttendanceDateKey;
    const lastType = profile.lastAttendance?.type;

    // --- Validation Rules ---
    if (actionType === 'IN') {
        if (lastDateKey === todayKey) {
            if (lastType === 'IN') {
                toast({ variant: 'destructive', title: 'ลงเวลาไม่สำเร็จ', description: 'คุณได้ลงเวลาเข้างานของวันนี้ไปแล้ว' });
                return;
            }
            if (lastType === 'OUT') {
                toast({ variant: 'destructive', title: 'ลงเวลาไม่สำเร็จ', description: 'คุณได้ลงเวลาออกงานของวันนี้ไปแล้ว ไม่สามารถลงเข้าซ้ำได้' });
                return;
            }
        }
    } else { // actionType === 'OUT'
        if (lastDateKey === todayKey && lastType === 'OUT') {
            toast({ variant: 'destructive', title: 'ลงเวลาไม่สำเร็จ', description: 'คุณได้ลงเวลาออกงานของวันนี้ไปแล้ว' });
            return;
        }
    }

    setIsSubmitting(true);
    const serverTime = serverTimestamp();

    try {
      const batch = writeBatch(db);
      const newAttendanceRef = doc(collection(db, 'attendance'));
      
      batch.set(newAttendanceRef, {
        userId: profile.uid,
        userName: profile.displayName,
        type: actionType,
        timestamp: serverTime,
        id: newAttendanceRef.id
      });
      
      batch.update(doc(db, 'users', profile.uid), {
        lastAttendance: { type: actionType, timestamp: serverTime },
        lastAttendanceDateKey: todayKey,
        updatedAt: serverTime
      });

      if (kioskToken) {
        batch.update(doc(db, "kioskTokens", kioskToken), { isActive: false });
      }
      
      await batch.commit();

      if (actionType === 'OUT' && lastDateKey !== todayKey) {
          toast({
            title: "ลงเวลาออกสำเร็จ (มีข้อสังเกต)",
            description: "แจ้งเตือน: วันนี้ไม่มีรายการลงเวลาเข้า ระบบได้บันทึกเป็นรายการออกอย่างเดียว",
          });
      } else {
          toast({
            title: `ลงเวลา${actionType === 'IN' ? 'เข้า' : 'ออก'}สำเร็จ`,
            description: `บันทึกเวลาเมื่อ ${safeFormat(now, 'HH:mm:ss')}`,
          });
      }
      
      setRecentClock({ type: actionType, time: now });

      // Redirect after 3s
      setTimeout(() => {
          router.replace('/app');
      }, 3000);

    } catch (error: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Rendering ---

  if (recentClock) {
    return (
       <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
           <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
           <h1 className="text-3xl font-bold">บันทึกสำเร็จ!</h1>
           <p className="text-muted-foreground mt-4 text-lg">
               คุณได้ลงเวลา <Badge variant={recentClock.type === 'IN' ? 'default' : 'secondary'}>{recentClock.type === 'IN' ? 'เข้า (IN)' : 'ออก (OUT)'}</Badge> เรียบร้อยแล้ว
           </p>
           <p className="text-xl font-semibold mt-6">{safeFormat(recentClock.time, 'HH:mm:ss')}</p>
           <p className="text-muted-foreground">{profile?.displayName}</p>
           <div className="mt-8 flex items-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              กำลังกลับไปหน้าหลัก...
           </div>
       </div>
    );
  }

  if (tokenStatus === "missing") {
      return (
          <div className="p-4">
            <PageHeader title="สแกนลงเวลา" description="กรุณาสแกน QR Code จากหน้าจอส่วนกลาง" />
             <Alert variant="destructive" className="max-w-md mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>ไม่พบข้อมูล QR Code</AlertTitle>
                <AlertDescription>กรุณาสแกน QR Code ที่ถูกต้องจากหน้าจอ Kiosk เพื่อบันทึกเวลา</AlertDescription>
              </Alert>
          </div>
      )
  }

  if (tokenStatus === 'invalid') {
       return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
             <ShieldX className="h-16 w-16 text-destructive mb-4" />
             <h1 className="text-3xl font-bold">QR Code ใช้งานไม่ได้</h1>
             <p className="font-semibold text-destructive mt-4 text-base">{tokenError?.th}</p>
             <p className="text-muted-foreground mt-2 text-sm max-w-md">กรุณาลองสแกนใหม่อีกครั้งจากหน้าจอ Kiosk</p>
         </div>
      )
  }

  const isActuallyLoading = authLoading || tokenStatus === "verifying";
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const cutoffStr = hrSettings?.afternoonCutoffTime || '12:00';
  const [cutoffH, cutoffM] = cutoffStr.split(':').map(Number);
  const cutoffMinutes = cutoffH * 60 + cutoffM;
  const nextAction = nowMinutes < cutoffMinutes ? 'IN' : 'OUT';

  return (
    <>
      <PageHeader title="ลงเวลาทำงาน" description={`บันทึกเวลาเข้า-ออกงานประจำวันที่ ${format(now, 'dd/MM/yyyy')}`} />
      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>ยืนยันการลงเวลา</CardTitle>
            <CardDescription>
                ขณะนี้เวลา {format(now, 'HH:mm')} ระบบจะบันทึกเป็นรายการ <Badge variant={nextAction === 'IN' ? 'default' : 'secondary'}>{nextAction === 'IN' ? 'เข้างาน (IN)' : 'ออกงาน (OUT)'}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button 
                size="lg" 
                className="w-full h-32 text-2xl flex-col gap-2" 
                onClick={handleClockAction} 
                disabled={isSubmitting || isActuallyLoading}
            >
                {isSubmitting || isActuallyLoading ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                ) : (
                    <>
                        {nextAction === 'IN' ? <LogIn className="h-10 w-10" /> : <LogOut className="h-10 w-10" />}
                        <span>บันทึกเวลา {nextAction === 'IN' ? 'เข้างาน' : 'ออกงาน'}</span>
                    </>
                )}
            </Button>
            
            {tokenStatus === 'valid' && tokenExpiresIn !== null && (
                <p className="text-xs text-muted-foreground">โค้ดจะหมดอายุใน {tokenExpiresIn} วินาที</p>
            )}

            {!isActuallyLoading && nextAction === 'OUT' && profile?.lastAttendanceDateKey !== format(now, 'yyyy-MM-dd') && (
                <div className="flex items-start text-sm text-amber-600 p-3 rounded-md bg-amber-50 border border-amber-200">
                    <AlertCircle className="mr-2 h-5 w-5 shrink-0" />
                    <p>วันนี้ยังไม่มีรายการลงเวลาเข้า ระบบจะบันทึกเป็นรายการออก (OUT) ทันที</p>
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
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>}>
            <ScanPageContent />
        </Suspense>
    )
}
