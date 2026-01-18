"use client";

import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInSeconds } from 'date-fns';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import type { Attendance } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const SPAM_DELAY_SECONDS = 60; // 1 minute

export default function AttendanceScanPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<Attendance | null | undefined>(undefined); // undefined for initial loading state
  const [recentClock, setRecentClock] = useState<{type: 'IN' | 'OUT', time: Date} | null>(null);
  const [secondsSinceLast, setSecondsSinceLast] = useState<number | null>(null);

  useEffect(() => {
    if (!db || !profile) return;

    const attendanceCollection = collection(db, `attendance`);
    const q = query(
      attendanceCollection,
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = { id: doc.id, ...doc.data() } as Attendance;
        setLastAttendance(data);

        const lastTimestamp = (data.timestamp as Timestamp).toDate();
        const diff = differenceInSeconds(new Date(), lastTimestamp);
        setSecondsSinceLast(diff);
      } else {
        setLastAttendance(null); // No records found
        setSecondsSinceLast(null);
      }
    }, (error) => {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch attendance status.' });
      setLastAttendance(null);
    });

    return () => unsubscribe();
  }, [db, toast, profile]);
  
  // Countdown timer for spam prevention
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

    if (secondsSinceLast !== null && secondsSinceLast <= SPAM_DELAY_SECONDS) {
        toast({ variant: 'destructive', title: 'Action Denied', description: `เพิ่งลงเวลาไปแล้ว กรุณารออีก ${SPAM_DELAY_SECONDS - secondsSinceLast} วินาที` });
        return;
    }

    setIsSubmitting(true);
    const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';

    const attendanceCollection = collection(db, `attendance`);
    const attendanceData = {
      userId: profile.uid,
      userName: profile.displayName,
      type: nextAction,
      timestamp: serverTimestamp(),
    };

    try {
      await addDoc(attendanceCollection, attendanceData);
      toast({
        title: `Successfully Clocked ${nextAction}`,
        description: `Your time has been recorded at ${format(new Date(), 'PPpp')}`,
      });
      setRecentClock({ type: nextAction, time: new Date() });
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

  const isLoading = lastAttendance === undefined || !profile;
  const nextAction: 'IN' | 'OUT' = !lastAttendance || lastAttendance.type === 'OUT' ? 'IN' : 'OUT';
  const canClock = secondsSinceLast === null || secondsSinceLast > SPAM_DELAY_SECONDS;

  if (recentClock) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
             <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
             <h1 className="text-3xl font-bold">ลงเวลาสำเร็จ!</h1>
             <p className="text-muted-foreground mt-2 text-lg">
                 คุณได้ลงเวลา <Badge variant={recentClock.type === 'IN' ? 'default' : 'secondary'}>{recentClock.type}</Badge> เรียบร้อยแล้ว
             </p>
             <p className="text-xl font-semibold mt-4">{format(recentClock.time, 'HH:mm:ss')}</p>
             <p className="text-muted-foreground">{profile?.displayName}</p>
             <Button onClick={() => setRecentClock(null)} className="mt-8">ลงเวลาอีกครั้ง</Button>
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
                    {lastAttendance ? ` lúc ${format((lastAttendance.timestamp as Timestamp).toDate(), 'HH:mm')}`: ''}
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
                {isSubmitting ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                    <>
                        {nextAction === 'IN' ? <LogIn className="mr-4 h-8 w-8" /> : <LogOut className="mr-4 h-8 w-8" />}
                        ลงเวลา{nextAction === 'IN' ? 'เข้า' : 'ออก'}
                    </>
                )}
            </Button>
            {!isLoading && !canClock && (
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
