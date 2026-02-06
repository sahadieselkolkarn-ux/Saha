"use client";

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from "zod";
import { addDoc, collection, query, where, orderBy, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { format, differenceInCalendarDays, getYear, isBefore, startOfToday, subMonths } from 'date-fns';

import { useFirebase } from '@/firebase/client-provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import type { WithId } from '@/firebase/firestore/use-collection';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LEAVE_TYPES, type LeaveType, type LeaveStatus } from '@/lib/constants';
import type { LeaveRequest, HRSettings } from '@/lib/types';
import { leaveTypeLabel, leaveStatusLabel } from '@/lib/ui-labels';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Calendar as CalendarIcon, Send, Trash2, AlertCircle, ExternalLink } from 'lucide-react';

const leaveRequestSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES, { required_error: 'กรุณาเลือกประเภทการลา' }),
  dateRange: z.object({
    from: z.date({ required_error: 'กรุณาเลือกวันเริ่มลา' }),
    to: z.date().optional(),
  }),
  reason: z.string().min(1, 'กรุณาระบุเหตุผลการลา'),
}).refine(data => {
    if (data.dateRange.from && data.dateRange.to) {
        return !isBefore(data.dateRange.to, data.dateRange.from);
    }
    return true;
}, {
    message: 'วันที่สิ้นสุดต้องไม่มาก่อนวันเริ่มลา',
    path: ['dateRange', 'to'],
});

type LeaveFormData = z.infer<typeof leaveRequestSchema>;

export default function MyLeavesPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingLeaveData, setPendingLeaveData] = useState<LeaveFormData | null>(null);
  const [isOverLimitConfirmOpen, setIsOverLimitConfirmOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);

  const employeeLeaveTypes = LEAVE_TYPES.filter(t => t === 'SICK' || t === 'BUSINESS' || t === 'VACATION');

  const form = useForm<LeaveFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      reason: '',
    },
  });
  
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);

  const userId = profile?.uid;

  const leavesQuery = useMemo(() => {
    if (!db || !userId) return null;
    return query(
      collection(db, 'hrLeaves'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
  }, [db, userId]);

  const { data: myLeaves, isLoading: leavesLoading, error } = useCollection<LeaveRequest>(leavesQuery);

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

  const submitToFirestore = async (data: LeaveFormData) => {
    if (!db || !profile || !data.dateRange.from) return;
    setIsSubmitting(true);

    const { leaveType, dateRange, reason } = data;
    const { from, to } = dateRange;
    const endDate = to || from;
    const days = differenceInCalendarDays(endDate, from) + 1;

    try {
      await addDoc(collection(db, 'hrLeaves'), {
        userId: profile.uid,
        userName: profile.displayName,
        leaveType,
        startDate: format(from, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        days,
        reason,
        status: 'SUBMITTED',
        year: getYear(from),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      toast({ title: 'ส่งใบลาสำเร็จ', description: 'คำขอของคุณถูกส่งไปรอการพิจารณาแล้ว' });
      form.reset({ reason: '', dateRange: { from: undefined, to: undefined } as any, leaveType: undefined });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ส่งใบลาไม่สำเร็จ', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: LeaveFormData) => {
    if (!hrSettings || !myLeaves || !data.dateRange.from) {
      await submitToFirestore(data);
      return;
    };

    const approvedLeavesThisYear = myLeaves.filter(l => l.year === getYear(data.dateRange.from!) && l.leaveType === data.leaveType && l.status === 'APPROVED');
    const daysTaken = approvedLeavesThisYear.reduce((sum, l) => sum + l.days, 0);
    const policy = hrSettings.leavePolicy?.leaveTypes?.[data.leaveType];
    const entitlement = policy?.annualEntitlement ?? 0;
    const daysInRequest = differenceInCalendarDays(data.dateRange.to || data.dateRange.from, data.dateRange.from) + 1;

    if (entitlement > 0 && (daysTaken + daysInRequest) > entitlement) {
      setPendingLeaveData(data);
      setIsOverLimitConfirmOpen(true);
    } else {
      await submitToFirestore(data);
    }
  };
  
  const handleConfirmOverLimit = async () => {
    if (pendingLeaveData) {
      await submitToFirestore(pendingLeaveData);
    }
    setIsOverLimitConfirmOpen(false);
    setPendingLeaveData(null);
  };

  async function handleCancel(leaveId: string) {
    if (!db) return;
    setCancellingId(leaveId);
    try {
      await updateDoc(doc(db, 'hrLeaves', leaveId), {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });
      toast({ title: "ยกเลิกคำขอลาเรียบร้อย" });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ไม่สามารถยกเลิกได้', description: error.message });
    } finally {
      setCancellingId(null);
    }
  }
  
  const getStatusVariant = (status: LeaveStatus) => {
    switch (status) {
      case 'SUBMITTED': return 'secondary';
      case 'APPROVED': return 'default';
      case 'REJECTED': return 'destructive';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  }

  const isLoading = leavesLoading || isLoadingSettings;

  const renderHistoryContent = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="h-24 text-center">
            <Loader2 className="mx-auto animate-spin text-muted-foreground" />
          </TableCell>
        </TableRow>
      );
    }

    if (indexCreationUrl) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center p-8">
            <div className="flex flex-col items-center gap-4 bg-muted/50 p-6 rounded-lg border border-dashed">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h3 className="font-semibold text-lg">ต้องสร้างดัชนี (Index) ก่อน</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                ฐานข้อมูลต้องการดัชนีเพื่อจัดเรียงประวัติการลาของคุณ กรุณากดปุ่มด้านล่างเพื่อสร้าง Index (ใช้เวลา 2-3 นาที)
              </p>
              <Button asChild>
                <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> สร้าง Index / Create Index
                </a>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (myLeaves && myLeaves.length > 0) {
      return myLeaves.map((leave) => (
        <TableRow key={leave.id}>
          <TableCell className="font-medium">
            {format(new Date(leave.startDate), 'dd/MM/yy')} 
            {leave.endDate !== leave.startDate && ` - ${format(new Date(leave.endDate), 'dd/MM/yy')}`}
          </TableCell>
          <TableCell>{leaveTypeLabel(leave.leaveType)}</TableCell>
          <TableCell className="text-center">{leave.days}</TableCell>
          <TableCell>
            <Badge variant={getStatusVariant(leave.status)}>{leaveStatusLabel(leave.status)}</Badge>
          </TableCell>
          <TableCell className="text-right">
            {leave.status === 'SUBMITTED' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={!!cancellingId} title="ยกเลิกใบลา">
                    {cancellingId === leave.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ยืนยันการยกเลิกคำขอลา?</AlertDialogTitle>
                    <AlertDialogDescription>
                      คุณต้องการยกเลิกใบลาประเภท {leaveTypeLabel(leave.leaveType)} วันที่ {format(new Date(leave.startDate), 'dd/MM/yyyy')} ใช่หรือไม่?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ปิด</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleCancel(leave.id)} className="bg-destructive hover:bg-destructive/90">
                      ยืนยันยกเลิก
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </TableCell>
        </TableRow>
      ));
    }

    return (
      <TableRow>
        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
          ยังไม่มีประวัติการลา
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <PageHeader title="ใบลาของฉัน" description="ยื่นใบลาและดูประวัติการลาของคุณ" />
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>ยื่นใบลาใหม่</CardTitle>
              <CardDescription>กรอกข้อมูลเพื่อส่งคำขอลาไปยังแผนกบุคคล</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="leaveType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ประเภทการลา</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="เลือกประเภทการลา" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employeeLeaveTypes.map(type => (
                              <SelectItem key={type} value={type}>{leaveTypeLabel(type)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateRange"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>ช่วงวันที่ต้องการลา</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value?.from && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.from ? (
                                  field.value.to ? (
                                    <>
                                      {format(field.value.from, "dd/MM/yyyy")} -{" "}
                                      {format(field.value.to, "dd/MM/yyyy")}
                                    </>
                                  ) : (
                                    format(field.value.from, "dd/MM/yyyy")
                                  )
                                ) : (
                                  <span>เลือกวันที่...</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <div className="flex flex-col">
                              <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={field.value?.from}
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => isBefore(date, subMonths(startOfToday(), 1))}
                                numberOfMonths={1}
                              />
                              <div className="p-3 border-t flex justify-end">
                                <Button size="sm" type="button" onClick={() => setIsCalendarOpen(false)}>
                                  ตกลง
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>เหตุผลการลา</FormLabel>
                        <FormControl>
                          <Textarea placeholder="ระบุเหตุผล เช่น ลาป่วยมีใบรับรองแพทย์, ลากิจไปทำธุระครอบครัว..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4"/>}
                    ส่งคำขอลา
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>ประวัติการลาของฉัน</CardTitle>
                    <CardDescription>รายการใบลาที่ยื่นในระบบทั้งหมด (เรียงตามล่าสุด)</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>วันที่ลา</TableHead>
                                <TableHead>ประเภท</TableHead>
                                <TableHead className="text-center">วัน</TableHead>
                                <TableHead>สถานะ</TableHead>
                                <TableHead className="text-right">จัดการ</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {renderHistoryContent()}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
       <AlertDialog open={isOverLimitConfirmOpen} onOpenChange={setIsOverLimitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>จำนวนวันลาของคุณเกินสิทธิ์ที่กำหนด</AlertDialogTitle>
            <AlertDialogDescription>
              การลาครั้งนี้จะทำให้วันลาสะสมเกินจำนวนวันที่บริษัทกำหนด คุณต้องการยืนยันการส่งใบลาต่อหรือไม่? (ทางบริษัทอาจมีการหักเงินเดือนตามนโยบาย)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingLeaveData(null)}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOverLimit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "ยืนยันส่งใบลา"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
