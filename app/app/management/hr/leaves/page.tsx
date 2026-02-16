"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, where, deleteDoc, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import type { WithId } from "@/firebase/firestore/use-collection";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getYear, parseISO, differenceInCalendarDays, isBefore, startOfYear, endOfYear, eachDayOfInterval, isSaturday, isSunday, format } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, CheckCircle, XCircle, ShieldAlert, MoreHorizontal, Trash2, Edit, PlusCircle, FileText, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LEAVE_STATUSES, LEAVE_TYPES } from "@/lib/constants";
import type { UserProfile, LeaveRequest, HRSettings, LeaveStatus, Attendance, HRHoliday } from "@/lib/types";
import { leaveStatusLabel, leaveTypeLabel, deptLabel } from "@/lib/ui-labels";

const leaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.string().min(1, "กรุณาเลือกวันเริ่ม"),
  endDate: z.string().min(1, "กรุณาเลือกวันสิ้นสุด"),
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
}).refine(data => !isBefore(new Date(data.endDate), new Date(data.startDate)), {
    message: 'วันที่สิ้นสุดต้องไม่มาก่อนวันเริ่มต้น',
    path: ['endDate'],
});

type LeaveFormData = z.infer<typeof leaveSchema>;

// Dialog for Creating or Editing Leaves by Admin
function LeaveManageDialog({ 
  leave, 
  targetUser,
  isOpen, 
  onClose, 
  onConfirm, 
  isSubmitting 
}: { 
  leave?: WithId<LeaveRequest> | null, 
  targetUser?: WithId<UserProfile> | null,
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (data: LeaveFormData) => Promise<void>, 
  isSubmitting: boolean 
}) {
  const form = useForm<LeaveFormData>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      leaveType: 'SICK',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      reason: '',
    }
  });

  useEffect(() => {
    if (isOpen) {
      if (leave) {
        form.reset({
          leaveType: leave.leaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          reason: leave.reason,
        });
      } else {
        form.reset({
          leaveType: 'SICK',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          reason: 'Admin บันทึกให้',
        });
      }
    }
  }, [leave, form, isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{leave ? 'แก้ไขข้อมูลการลา' : 'สร้างรายการลาใหม่ (โดย Admin)'}</DialogTitle>
            <DialogDescription>
              พนักงาน: {leave?.userName || targetUser?.displayName || 'ไม่ระบุ'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form id="manage-leave-form" onSubmit={form.handleSubmit(onConfirm)} className="space-y-4 py-4">
               <FormField control={form.control} name="leaveType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ประเภทการลา</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                      <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{leaveTypeLabel(t)}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="startDate" render={({ field }) => (<FormItem><FormLabel>วันเริ่มลา</FormLabel><FormControl><Input type="date" {...field}/></FormControl></FormItem>)} />
                    <FormField control={form.control} name="endDate" render={({ field }) => (<FormItem><FormLabel>วันสิ้นสุด</FormLabel><FormControl><Input type="date" {...field}/></FormControl></FormItem>)} />
                </div>
                <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>เหตุผล/หมายเหตุ</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
            <Button type="submit" form="manage-leave-form" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : (leave ? 'บันทึกการแก้ไข' : 'สร้างและอนุมัติทันที')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

export default function ManagementHRLeavesPage() {
  const { db } = useFirebase();
  const { profile: adminProfile } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('summary');
  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [filters, setFilters] = useState({ status: 'ALL', userId: 'ALL' });
  
  const [rejectingLeave, setRejectingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingLeave, setApprovingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [deletingLeave, setDeletingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [editingLeave, setEditingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [creatingForUser, setCreatingForUser] = useState<WithId<UserProfile> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For Summary data including Absences
  const [yearlyAttendance, setYearlyAttendance] = useState<Attendance[]>([]);
  const [yearlyHolidays, setYearlyHolidays] = useState<Map<string, string>>(new Map());
  const [isLoadingSummaryExtras, setIsLoadingSummaryExtras] = useState(false);

  // Real-time Queries
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), orderBy('displayName', 'asc')) : null, [db]);
  const leavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), orderBy('createdAt', 'desc')) : null, [db]);
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);
  const { data: allLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(leavesQuery);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);

  // Fetch Attendance and Holidays for the selected year to calculate Absences
  useEffect(() => {
    if (!db || !selectedYear) return;
    
    const fetchSummaryExtras = async () => {
        setIsLoadingSummaryExtras(true);
        try {
            const start = startOfYear(new Date(selectedYear, 0, 1));
            const end = endOfYear(new Date(selectedYear, 0, 1));
            
            const [attSnap, holSnap] = await Promise.all([
                getDocs(query(collection(db, 'attendance'), where('timestamp', '>=', start), where('timestamp', '<=', end))),
                getDocs(query(collection(db, 'hrHolidays'), where('date', '>=', format(start, 'yyyy-MM-dd')), where('date', '<=', format(end, 'yyyy-MM-dd'))))
            ]);

            setYearlyAttendance(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
            setYearlyHolidays(new Map(holSnap.docs.map(d => [d.data().date, d.data().name])));
        } catch (e) {
            console.error("Failed to fetch summary extras:", e);
        } finally {
            setIsLoadingSummaryExtras(false);
        }
    };

    fetchSummaryExtras();
  }, [db, selectedYear]);

  const { leaveSummary, filteredLeaves, yearOptions } = useMemo(() => {
    const years = new Set<number>();
    const currentYear = getYear(new Date());
    years.add(currentYear);

    if (allLeaves) {
      allLeaves.forEach(leave => {
        const year = leave.year || (leave.startDate ? getYear(parseISO(leave.startDate)) : null);
        if (year) years.add(year);
      });
    }
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    if (!allLeaves || !users) {
      return { leaveSummary: [], filteredLeaves: [], yearOptions: sortedYears };
    }

    // Attendance/Absence Calculation
    const today = new Date();
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const endBound = selectedYear === getYear(today) ? today : endOfYear(new Date(selectedYear, 0, 1));
    const daysInterval = eachDayOfInterval({ start, end: endBound });
    const weekendMode = hrSettings?.weekendPolicy?.mode || 'SAT_SUN';

    const summary = users.map(user => {
        const userLeaves = allLeaves.filter(l => 
            l.userId === user.id && 
            l.status === 'APPROVED' && 
            (l.year === selectedYear || (l.startDate && getYear(parseISO(l.startDate)) === selectedYear))
        );

        const sickDays = userLeaves.filter(l => l.leaveType === 'SICK').reduce((s, l) => s + (l.days || 0), 0);
        const businessDays = userLeaves.filter(l => l.leaveType === 'BUSINESS').reduce((s, l) => s + (l.days || 0), 0);
        const vacationDays = userLeaves.filter(l => l.leaveType === 'VACATION').reduce((s, l) => s + (l.days || 0), 0);
        const totalLeave = sickDays + businessDays + vacationDays;

        // Calculate Absences
        let absentDays = 0;
        const userAttendance = yearlyAttendance.filter(a => a.userId === user.id);
        const attendanceDates = new Set(userAttendance.map(a => format(a.timestamp.toDate(), 'yyyy-MM-dd')));

        if (user.hr?.payType === 'MONTHLY' || user.hr?.payType === 'DAILY') {
            daysInterval.forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                
                // Skip if before hire date
                if (user.hr?.startDate && isBefore(day, parseISO(user.hr.startDate))) return;
                // Skip if after end date
                if (user.hr?.endDate && isBefore(parseISO(user.hr.endDate), day)) return;
                // Skip holidays
                if (yearlyHolidays.has(dayStr)) return;
                // Skip weekends
                const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
                if (isWeekendDay) return;
                // Skip if on approved leave
                const onLeave = userLeaves.some(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
                if (onLeave) return;

                // If no clock-in record found for a work day -> Absent
                if (!attendanceDates.has(dayStr)) {
                    absentDays++;
                }
            });
        }

        return {
            userId: user.id,
            userName: user.displayName,
            user,
            SICK: sickDays,
            BUSINESS: businessDays,
            VACATION: vacationDays,
            TOTAL: totalLeave,
            ABSENT: absentDays
        };
    }).filter(s => s.TOTAL > 0 || s.ABSENT > 0 || filters.userId === 'ALL' || filters.userId === s.userId);
    
    const filtered = allLeaves.filter(leave => {
      const leaveYear = leave.year || (leave.startDate ? getYear(parseISO(leave.startDate)) : null);
      return (
        leaveYear === selectedYear &&
        (filters.status === 'ALL' || leave.status === filters.status) &&
        (filters.userId === 'ALL' || leave.userId === filters.userId)
      );
    });

    return { leaveSummary: summary, filteredLeaves: filtered, yearOptions: sortedYears };
  }, [allLeaves, users, selectedYear, filters, yearlyAttendance, yearlyHolidays, hrSettings]);

  const overLimitDetails = useMemo(() => {
    if (!approvingLeave || !hrSettings || !allLeaves || !users) return null;

    const leave = approvingLeave;
    const approvedLeavesThisYear = allLeaves.filter(l =>
        l.userId === leave.userId && 
        (l.year === leave.year || (l.startDate && getYear(parseISO(l.startDate)) === leave.year)) && 
        l.leaveType === leave.leaveType && 
        l.status === 'APPROVED'
    );
    const daysTaken = approvedLeavesThisYear.reduce((sum, l) => sum + (l.days || 0), 0);

    const policy = hrSettings.leavePolicy?.leaveTypes?.[leave.leaveType];
    const entitlement = policy?.annualEntitlement ?? 0;
    
    if (entitlement > 0 && (daysTaken + leave.days) > entitlement) {
        const salary = users.find(u => u.id === leave.userId)?.hr?.salaryMonthly;
        const deductionBaseDays = policy?.overLimitHandling?.salaryDeductionBaseDays ?? 26;
        let deductionAmount = 0;
        const overDays = (daysTaken + leave.days) - entitlement;
        
        if (policy?.overLimitHandling?.mode === 'DEDUCT_SALARY' && salary) {
            deductionAmount = (salary / deductionBaseDays) * overDays;
        }
        return { mode: policy?.overLimitHandling?.mode, amount: deductionAmount, days: overDays };
    }
    return null;
  }, [approvingLeave, hrSettings, allLeaves, users]);

  const handleApprove = async () => {
    if (!db || !adminProfile || !approvingLeave) return;

    setIsSubmitting(true);
    try {
      const leaveRef = doc(db, 'hrLeaves', approvingLeave.id);
      await updateDoc(leaveRef, {
        status: 'APPROVED',
        approvedByName: adminProfile.displayName,
        approvedAt: serverTimestamp(),
        overLimit: !!overLimitDetails,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'อนุมัติใบลาสำเร็จ' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'การอนุมัติล้มเหลว', description: error.message });
    } finally {
      setIsSubmitting(false);
      setApprovingLeave(null);
    }
  };

  const handleReject = async () => {
    if (!db || !adminProfile || !rejectingLeave || !rejectReason) return;
    setIsSubmitting(true);
    try {
      const leaveRef = doc(db, 'hrLeaves', rejectingLeave.id);
      await updateDoc(leaveRef, {
        status: 'REJECTED',
        rejectedByName: adminProfile.displayName,
        rejectedAt: serverTimestamp(),
        rejectReason,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'ปฏิเสธใบลาสำเร็จ' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'การปฏิเสธล้มเหลว', description: error.message });
    } finally {
      setIsSubmitting(false);
      setRejectingLeave(null);
      setRejectReason('');
    }
  };

  const handleAdminManageSave = async (data: LeaveFormData) => {
    if (!db || !adminProfile) return;
    setIsSubmitting(true);
    try {
        const days = differenceInCalendarDays(new Date(data.endDate), new Date(data.startDate)) + 1;
        const year = getYear(new Date(data.startDate));

        if (editingLeave) {
            await updateDoc(doc(db, 'hrLeaves', editingLeave.id), {
                ...data,
                days,
                year,
                updatedAt: serverTimestamp(),
            });
            toast({ title: "แก้ไขใบลาสำเร็จ" });
            setEditingLeave(null);
        } else if (creatingForUser) {
            await addDoc(collection(db, 'hrLeaves'), {
                userId: creatingForUser.id,
                userName: creatingForUser.displayName,
                ...data,
                days,
                year,
                status: 'APPROVED', // Direct approved by admin
                approvedByName: adminProfile.displayName,
                approvedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: "สร้างและอนุมัติใบลาเรียบร้อย" });
            setCreatingForUser(null);
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: "ทำรายการไม่สำเร็จ", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!db || !deletingLeave) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'hrLeaves', deletingLeave.id));
      toast({ title: 'ลบรายการลาเรียบร้อย' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ลบไม่สำเร็จ', description: error.message });
    } finally {
      setIsSubmitting(false);
      setDeletingLeave(null);
    }
  };

  const getStatusVariant = (status: LeaveStatus) => {
    switch (status) {
      case 'SUBMITTED': return 'secondary';
      case 'APPROVED': return 'default';
      case 'REJECTED': return 'destructive';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  };

  const isWithinInterval = (date: Date, interval: { start: Date; end: Date }) => {
    return date >= interval.start && date <= interval.end;
  }

  if (isLoadingUsers || isLoadingSettings || isLoadingLeaves) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
        <PageHeader title="จัดการวันลา" description="จัดการและตรวจสอบข้อมูลการลา/ขาดงาน ของพนักงาน" />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
            <TabsTrigger value="summary">สรุปวันลาและวันขาด</TabsTrigger>
            <TabsTrigger value="requests">คำขอทั้งหมด</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4">
            <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>สรุปวันลาและวันขาดสะสม</CardTitle>
                    <CardDescription>ข้อมูลที่อนุมัติแล้วประจำปี {selectedYear}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLoadingSummaryExtras && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead className="text-center">ป่วย (วัน)</TableHead>
                    <TableHead className="text-center">กิจ (วัน)</TableHead>
                    <TableHead className="text-center">พักร้อน (วัน)</TableHead>
                    <TableHead className="text-center">รวมลา (วัน)</TableHead>
                    <TableHead className="text-center text-destructive font-bold">วันขาด (Absent)</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leaveSummary.length > 0 ? leaveSummary.map(s => (
                    <TableRow key={s.userId} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">
                            {s.userName}
                            <p className="text-[10px] text-muted-foreground">{deptLabel(s.user.department)}</p>
                        </TableCell>
                        <TableCell className="text-center">{s.SICK}</TableCell>
                        <TableCell className="text-center">{s.BUSINESS}</TableCell>
                        <TableCell className="text-center">{s.VACATION}</TableCell>
                        <TableCell className="text-center font-semibold text-primary">{s.TOTAL}</TableCell>
                        <TableCell className="text-center font-bold text-destructive bg-destructive/5">{s.ABSENT}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => { setFilters(f => ({ ...f, userId: s.userId })); setActiveTab('requests'); }}>
                                        <FileText className="mr-2 h-4 w-4"/> ดูรายการใบลา
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setCreatingForUser(s.user)}>
                                        <PlusCircle className="mr-2 h-4 w-4"/> สร้างใบลาให้ (แก้ขาดงาน)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={7} className="text-center h-24 text-muted-foreground">ยังไม่มีข้อมูลในปีนี้</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="requests" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>คำขอลาทั้งหมด</CardTitle>
                <CardDescription>ตรวจสอบและจัดการสถานะคำขอลา</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[100px] max-w-[120px]">
                  <Label className="text-xs">ปี</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
                  <Label className="text-xs">สถานะ</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters(f => ({...f, status: v}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="ALL">ทุกสถานะ</SelectItem>{LEAVE_STATUSES.map(s=><SelectItem key={s} value={s}>{leaveStatusLabel(s)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                  <Label className="text-xs">พนักงาน</Label>
                  <Select value={filters.userId} onValueChange={(v) => setFilters(f => ({...f, userId: v}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="ALL">พนักงานทั้งหมด</SelectItem>{users?.map(u=><SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                </div>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>วันที่ลา</TableHead>
                    <TableHead className="text-center">จำนวนวัน</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredLeaves.length > 0 ? filteredLeaves.map(leave => (
                    <TableRow key={leave.id}>
                        <TableCell className="font-medium">{leave.userName}</TableCell>
                        <TableCell>{leaveTypeLabel(leave.leaveType)}</TableCell>
                        <TableCell className="text-sm">{safeFormat(parseISO(leave.startDate), 'dd/MM/yy')} - {safeFormat(parseISO(leave.endDate), 'dd/MM/yy')}</TableCell>
                        <TableCell className="text-center">{leave.days}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(leave.status)}>{leaveStatusLabel(leave.status)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setEditingLeave(leave)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>แก้ไขข้อมูล</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onSelect={() => setApprovingLeave(leave)} disabled={leave.status !== 'SUBMITTED'}>
                                    <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                    <span>อนุมัติการลา</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setRejectingLeave(leave)} className="text-destructive focus:text-destructive" disabled={leave.status !== 'SUBMITTED'}>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    <span>ไม่อนุมัติ</span>
                                </DropdownMenuItem>
                              {adminProfile?.role === 'ADMIN' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setDeletingLeave(leave)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>ลบรายการ</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">ไม่พบคำขอที่ตรงกับตัวกรอง</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        
        {/* Manage Leave Dialog (Shared for Create/Edit) */}
        {(editingLeave || creatingForUser) && (
            <LeaveManageDialog 
                leave={editingLeave} 
                targetUser={creatingForUser}
                isOpen={!!editingLeave || !!creatingForUser} 
                onClose={() => { setEditingLeave(null); setCreatingForUser(null); }} 
                onConfirm={handleAdminManageSave} 
                isSubmitting={isSubmitting} 
            />
        )}

        <AlertDialog open={!!approvingLeave} onOpenChange={(open) => !open && setApprovingLeave(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการอนุมัติ</AlertDialogTitle>
                <AlertDialogDescription>
                คุณต้องการอนุมัติใบลาของ <span className="font-bold">{approvingLeave?.userName}</span> ใช่หรือไม่?
                </AlertDialogDescription>
            </AlertDialogHeader>
            {overLimitDetails && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-destructive">คำเตือน: วันลาเกินสิทธิ์</h4>
                            <p className="text-destructive/80 text-sm">การอนุมัตินี้จะทำให้วันลาเกินจำนวนสิทธิ์ {overLimitDetails.days} วัน</p>
                            {overLimitDetails.mode === 'DEDUCT_SALARY' && (
                                <p className="text-destructive/80 text-sm mt-1">ยอดหักเงินเดือนโดยประมาณ: {overLimitDetails.amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={handleApprove} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการอนุมัติ'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <Dialog open={!!rejectingLeave} onOpenChange={(open) => !open && setRejectingLeave(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>ระบุเหตุผลที่ไม่อนุมัติ</DialogTitle>
                    <DialogDescription>สำหรับ: {rejectingLeave?.userName}</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="ระบุรายละเอียดเหตุผล..."/>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRejectingLeave(null)} disabled={isSubmitting}>ยกเลิก</Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isSubmitting || !rejectReason}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : 'ยืนยันไม่อนุมัติ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
         <AlertDialog open={!!deletingLeave} onOpenChange={(open) => !open && setDeletingLeave(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการลบรายการ</AlertDialogTitle>
                <AlertDialogDescription>
                ต้องการลบรายการลาของ {deletingLeave?.userName} ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันลบข้อมูล'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </Tabs>
    </>
  );
}
