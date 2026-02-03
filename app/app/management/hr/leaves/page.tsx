"use client";

import { useState, useMemo, useEffect } from "react";
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, where, deleteDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import type { WithId } from "@/firebase/firestore/use-collection";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getYear, parseISO, differenceInCalendarDays, isBefore } from 'date-fns';
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
import { Loader2, CheckCircle, XCircle, ShieldAlert, MoreHorizontal, Trash2, Edit } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAVE_STATUSES, LEAVE_TYPES } from "@/lib/constants";
import type { UserProfile, LeaveRequest, HRSettings, LeaveStatus } from "@/lib/types";
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
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { leaveStatusLabel, leaveTypeLabel } from "@/lib/ui-labels";
import { Input } from "@/components/ui/input";

const editLeaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.string().min(1, "กรุณาเลือกวันเริ่ม"),
  endDate: z.string().min(1, "กรุณาเลือกวันสิ้นสุด"),
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
}).refine(data => !isBefore(new Date(data.endDate), new Date(data.startDate)), {
    message: 'วันที่สิ้นสุดต้องไม่มาก่อนวันเริ่มต้น',
    path: ['endDate'],
});
type EditLeaveFormData = z.infer<typeof editLeaveSchema>;


function EditLeaveDialog({ leave, isOpen, onClose, onConfirm, isSubmitting }: { leave: WithId<LeaveRequest>, isOpen: boolean, onClose: () => void, onConfirm: (data: EditLeaveFormData) => Promise<void>, isSubmitting: boolean }) {
  const form = useForm<EditLeaveFormData>({
    resolver: zodResolver(editLeaveSchema),
    defaultValues: {
      leaveType: leave.leaveType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      reason: leave.reason,
    }
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
      });
    }
  }, [leave, form, isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลการลา</DialogTitle>
            <DialogDescription>
              สำหรับ: {leave.userName}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form id="edit-leave-form" onSubmit={form.handleSubmit(onConfirm)} className="space-y-4 py-4">
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
                <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>เหตุผล</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
            <Button type="submit" form="edit-leave-form" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : 'บันทึกการแก้ไข'}
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

  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [filters, setFilters] = useState({ status: 'ALL', userId: 'ALL' });
  
  const [rejectingLeave, setRejectingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingLeave, setApprovingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [deletingLeave, setDeletingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [editingLeave, setEditingLeave] = useState<WithId<LeaveRequest> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time Queries
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), orderBy('displayName', 'asc')) : null, [db]);
  const leavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), orderBy('createdAt', 'desc')) : null, [db]);
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);
  const { data: allLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(leavesQuery);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);

  const isLoading = isLoadingSettings || isLoadingUsers || isLoadingLeaves;

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

    const approvedLeaveDaysMap = new Map<string, { SICK: number; BUSINESS: number; VACATION: number; TOTAL: number }>();
    users.forEach(user => {
        approvedLeaveDaysMap.set(user.id, { SICK: 0, BUSINESS: 0, VACATION: 0, TOTAL: 0 });
    });
    
    allLeaves.forEach(leave => {
        const leaveYear = leave.year || (leave.startDate ? getYear(parseISO(leave.startDate)) : null);
        if (leave.status === 'APPROVED' && leaveYear === selectedYear) {
            const userLeave = approvedLeaveDaysMap.get(leave.userId);
            if (userLeave && leave.leaveType in userLeave) {
                (userLeave as any)[leave.leaveType] += (leave.days || 0);
                userLeave.TOTAL += (leave.days || 0);
            }
        }
    });

    const summary = users.map(user => {
        const userLeaveDays = approvedLeaveDaysMap.get(user.id) || { SICK: 0, BUSINESS: 0, VACATION: 0, TOTAL: 0 };
        return {
            userId: user.id,
            userName: user.displayName,
            ...userLeaveDays
        };
    }).filter(s => s.TOTAL > 0 || filters.userId === 'ALL' || filters.userId === s.userId);
    
    const filtered = allLeaves.filter(leave => {
      const leaveYear = leave.year || (leave.startDate ? getYear(parseISO(leave.startDate)) : null);
      return (
        leaveYear === selectedYear &&
        (filters.status === 'ALL' || leave.status === filters.status) &&
        (filters.userId === 'ALL' || leave.userId === filters.userId)
      );
    });

    return { leaveSummary: summary, filteredLeaves: filtered, yearOptions: sortedYears };
  }, [allLeaves, users, selectedYear, filters]);

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

  const handleEditSave = async (data: EditLeaveFormData) => {
    if (!db || !editingLeave) return;
    setIsSubmitting(true);
    try {
        const days = differenceInCalendarDays(new Date(data.endDate), new Date(data.startDate)) + 1;
        await updateDoc(doc(db, 'hrLeaves', editingLeave.id), {
            ...data,
            days,
            year: getYear(new Date(data.startDate)),
            updatedAt: serverTimestamp(),
        });
        toast({ title: "แก้ไขใบลาสำเร็จ" });
        setEditingLeave(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: "แก้ไขไม่สำเร็จ", description: e.message });
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

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
        <PageHeader title="วันลา" description="จัดการและตรวจสอบข้อมูลการลาของพนักงาน" />
        <Tabs defaultValue="summary">
        <TabsList>
            <TabsTrigger value="summary">สรุปวันลา</TabsTrigger>
            <TabsTrigger value="requests">คำขอทั้งหมด</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4">
            <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>สรุปวันลาสะสม</CardTitle>
                    <CardDescription>จำนวนวันลาที่อนุมัติแล้วประจำปี {selectedYear}</CardDescription>
                  </div>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead className="text-center">ป่วย</TableHead>
                    <TableHead className="text-center">กิจ</TableHead>
                    <TableHead className="text-center">พักร้อน</TableHead>
                    <TableHead className="text-right">รวมทั้งหมด</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leaveSummary.length > 0 ? leaveSummary.map(s => (
                    <TableRow key={s.userId}>
                        <TableCell className="font-medium">{s.userName}</TableCell>
                        <TableCell className="text-center">{s.SICK}</TableCell>
                        <TableCell className="text-center">{s.BUSINESS}</TableCell>
                        <TableCell className="text-center">{s.VACATION}</TableCell>
                        <TableCell className="text-right font-bold">{s.TOTAL} วัน</TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">ยังไม่มีการลาที่อนุมัติในปีนี้</TableCell></TableRow>}
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
                <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
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
        {editingLeave && <EditLeaveDialog leave={editingLeave} isOpen={!!editingLeave} onClose={() => setEditingLeave(null)} onConfirm={handleEditSave} isSubmitting={isSubmitting} />}
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
