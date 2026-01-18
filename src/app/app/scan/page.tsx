"use client";

import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LogOut, History } from 'lucide-react';
import type { Attendance } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ScanPage() {
  const { user, profile, db } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<Attendance | null>(null);
  const [todaysAttendance, setTodaysAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoize the query for the last attendance record
  const lastAttendanceQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(
      collection(db, `users/${user.uid}/attendance`),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
  }, [user, db]);

  // Memoize the query for today's attendance records
  const todaysAttendanceQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return query(
      collection(db, `users/${user.uid}/attendance`),
      where('timestamp', '>=', today),
      where('timestamp', '<', tomorrow),
      orderBy('timestamp', 'desc')
    );
  }, [user, db]);

  // Effect for last attendance
  useEffect(() => {
    if (!lastAttendanceQuery || !user) return;
    setLoading(true);
    const unsubscribe = onSnapshot(lastAttendanceQuery, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setLastAttendance({ id: doc.id, ...doc.data() } as Attendance);
      } else {
        setLastAttendance(null);
      }
      setLoading(false);
    }, (error) => {
      const permissionError = new FirestorePermissionError({ path: `users/${user.uid}/attendance`, operation: 'list' });
      errorEmitter.emit('permission-error', permissionError);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [lastAttendanceQuery, user]);

  // Effect for today's attendance
  useEffect(() => {
    if (!todaysAttendanceQuery || !user) return;
    const unsubscribe = onSnapshot(todaysAttendanceQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      setTodaysAttendance(records);
    }, (error) => {
      const permissionError = new FirestorePermissionError({ path: `users/${user.uid}/attendance`, operation: 'list' });
      errorEmitter.emit('permission-error', permissionError);
    });
    return () => unsubscribe();
  }, [todaysAttendanceQuery, user]);

  const handleClockAction = async (type: 'IN' | 'OUT') => {
    if (!user || !profile || !db) return;
    setIsSubmitting(true);

    const attendanceCollection = collection(db, `users/${user.uid}/attendance`);
    const attendanceData = {
      userId: user.uid,
      userName: profile.displayName,
      type: type,
      timestamp: serverTimestamp(),
    };

    addDoc(attendanceCollection, attendanceData)
      .then(() => {
        toast({
          title: `Successfully Clocked ${type}`,
          description: `Your time has been recorded at ${format(new Date(), 'PPpp')}`,
        });
      })
      .catch((error: any) => {
        const permissionError = new FirestorePermissionError({ path: attendanceCollection.path, operation: 'create', requestResourceData: attendanceData });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: `Failed to Clock ${type}`,
          description: error.message,
        });
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };
  
  const canClockIn = !lastAttendance || lastAttendance.type === 'OUT';
  const canClockOut = lastAttendance && lastAttendance.type === 'IN';

  return (
    <>
      <PageHeader title="Time Clock" description="Record your clock-in and clock-out times here." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clock In / Out</CardTitle>
            {loading ? (
                <CardDescription>Loading current status...</CardDescription>
            ) : (
                <CardDescription>
                    Your last recorded action was a <Badge variant={lastAttendance?.type === 'IN' ? 'default' : 'secondary'}>{lastAttendance?.type || 'N/A'}</Badge> {lastAttendance ? `on ${format((lastAttendance.timestamp as Timestamp).toDate(), 'PPp')}`: ''}.
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button size="lg" className="flex-1" onClick={() => handleClockAction('IN')} disabled={isSubmitting || !canClockIn || loading}>
                {isSubmitting && canClockIn ? <Loader2 className="animate-spin" /> : <LogIn />}
                Clock In
            </Button>
            <Button size="lg" variant="outline" className="flex-1" onClick={() => handleClockAction('OUT')} disabled={isSubmitting || !canClockOut || loading}>
                {isSubmitting && canClockOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                Clock Out
            </Button>
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <History className="h-5 w-5"/>
                    <CardTitle>Today's History</CardTitle>
                </div>
                <CardDescription>Your clock-in/out records for today.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center"><Loader2 className="mx-auto animate-spin" /></TableCell>
                            </TableRow>
                        ) : todaysAttendance.length > 0 ? todaysAttendance.map(att => (
                            <TableRow key={att.id}>
                                <TableCell>{format((att.timestamp as Timestamp).toDate(), 'HH:mm:ss')}</TableCell>
                                <TableCell><Badge variant={att.type === 'IN' ? 'default' : 'secondary'}>{att.type}</Badge></TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center text-muted-foreground">No records for today.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
