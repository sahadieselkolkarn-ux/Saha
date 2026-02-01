"use client";

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { useCollection } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { safeFormat } from '@/lib/date-utils';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import type { Attendance } from '@/lib/types';

export default function AttendanceHistoryPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  
  // Extracting the uid to a stable variable to prevent re-creating the query on every profile change.
  const userId = profile?.uid;

  const attendanceQuery = useMemo(() => {
    if (!db || !userId) return null;
    return query(
      collection(db, `attendance`),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
  }, [db, userId]); // Depend on the stable userId instead of the whole profile object.

  const { data: attendance, isLoading, error } = useCollection<Attendance>(attendanceQuery);

  useEffect(() => {
    if (error?.message?.includes('requires an index')) {
        const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            setIndexCreationUrl(urlMatch[0]);
        }
    } else {
        setIndexCreationUrl(null);
    }
  }, [error]);

  const renderError = () => {
    if (!error) return null;
    
    if (indexCreationUrl) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="text-center p-8">
            <div className="flex flex-col items-center gap-4 bg-muted/50 p-6 rounded-lg">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h3 className="font-semibold text-lg text-foreground">ต้องสร้างดัชนี (Index) ก่อน</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                ฐานข้อมูลต้องการดัชนีเพื่อเรียงลำดับข้อมูลประวัติการลงเวลาของคุณ
                กรุณากดปุ่มด้านล่างเพื่อสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที) แล้วลองรีเฟรชหน้านี้
              </p>
              <p className="text-xs text-muted-foreground pt-2">
                Index Required: Collection `attendance`, Fields: `userId` (Ascending), `timestamp` (Descending)
              </p>
              <Button asChild className="mt-2">
                <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  เปิดหน้าสร้าง Index
                </a>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow>
        <TableCell colSpan={4} className="text-center text-destructive">
          Error: {error.message}
        </TableCell>
      </TableRow>
    );
  };


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
                 renderError()
              ) : attendance && attendance.length > 0 ? (
                attendance.map(att => (
                  <TableRow key={att.id}>
                    <TableCell className="font-medium">{safeFormat(att.timestamp, 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{safeFormat(att.timestamp, 'HH:mm')}</TableCell>
                    <TableCell>
                      <Badge variant={att.type === 'IN' ? 'default' : 'secondary'}>
                        {att.type === 'IN' ? 'IN (เข้า)' : 'OUT (ออก)'}
                      </Badge>
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
