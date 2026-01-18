"use client";

import { useMemo } from 'react';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useAuth } from '@/context/auth-context';
import { format } from 'date-fns';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import type { Attendance } from '@/lib/types';

export default function AttendanceHistoryPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();

  const attendanceQuery = useMemo(() => {
    if (!db || !profile) return null;
    return query(
      collection(db, `attendance`),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc')
    );
  }, [db, profile]);

  const { data: attendance, isLoading, error } = useCollection<Attendance>(attendanceQuery);

  return (
    <>
      <PageHeader title="Attendance History" description="View your clock-in and clock-out records." />
      <Card>
        <CardHeader>
          <CardTitle>ประวัติการลงเวลา</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>เวลา</TableHead>
                <TableHead>การกระทำ</TableHead>
                <TableHead>ชื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24">
                    <Loader2 className="mx-auto animate-spin" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                 <TableRow>
                  <TableCell colSpan={4} className="text-center text-destructive">
                    Error: {error.message}
                  </TableCell>
                </TableRow>
              ) : attendance && attendance.length > 0 ? (
                attendance.map(att => (
                  <TableRow key={att.id}>
                    <TableCell className="font-medium">{att.timestamp ? format((att.timestamp as Timestamp).toDate(), 'PPP') : 'N/A'}</TableCell>
                    <TableCell>{att.timestamp ? format((att.timestamp as Timestamp).toDate(), 'HH:mm:ss') : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={att.type === 'IN' ? 'default' : 'secondary'}>{att.type}</Badge>
                    </TableCell>
                    <TableCell>{att.userName}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    ไม่พบข้อมูลการลงเวลา
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
