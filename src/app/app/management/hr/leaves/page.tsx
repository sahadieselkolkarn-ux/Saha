
"use client";

import { useState, useMemo, useEffect } from "react";
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, where, getDocs, deleteDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getYear, parseISO } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, ShieldAlert, MoreHorizontal, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAVE_STATUSES } from "@/lib/constants";
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
import { useDoc } from "@/firebase/firestore/use-doc";
import { WithId } from "@/firebase/firestore/use-collection";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { leaveStatusLabel, leaveTypeLabel } from "@/lib/ui-labels";


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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use state for one-time fetches
  const [allLeaves, setAllLeaves] = useState<WithId<LeaveRequest>[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
  const [users, setUsers] = useState<WithId<UserProfile>[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Still use useDoc for single, low-traffic documents
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
  
  // Fetch users and leaves once
  useEffect(() => {
    if (!db) return;

    const fetchData = async () => {
      setIsLoadingLeaves(true);
      setIsLoadingUsers(true);
      try {
        const usersQuery = query(collection(db, 'users'), orderBy('displayName', 'asc'));
        const leavesQuery = query(collection(db, 'hrLeaves'), orderBy('createdAt', 'desc'));

        const [usersSnapshot, leavesSnapshot] = await Promise.all([
          getDocs(usersQuery),
          getDocs(leavesQuery)
        ]);

        const usersData = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
        setUsers(usersData);

        const leavesData = leavesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<LeaveRequest>));
        setAllLeaves(leavesData);

      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error fetching data', description: error.message });
      } finally {
        setIsLoadingLeaves(false);
        setIsLoadingUsers(false);
      }
    };
    
    fetchData();
  }, [db, toast]);


  const isLoading = isLoadingSettings || isLoadingUsers || isLoadingLeaves;

  const { leaveSummary, filteredLeaves, yearOptions } = useMemo(() => {
    const years = new Set<number>();
    if (allLeaves) {
      allLeaves.forEach(leave => years.add(leave.year));
    }
    const currentYear = getYear(new Date());
    years.add(currentYear);
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    if (!allLeaves || !users) {
      return { leaveSummary: [], filteredLeaves: [], yearOptions: sortedYears };
    }

    const approvedLeaveDaysMap = new Map<string, { SICK: number; BUSINESS: number; VACATION: number; TOTAL: number }>();
    users.forEach(user => {
        approvedLeaveDaysMap.set(user.id, { SICK: 0, BUSINESS: 0, VACATION: 0, TOTAL: 0 });
    });
    
    allLeaves.forEach(leave => {
        if (leave.status === 'APPROVED' && leave.year === selectedYear) {
            const userLeave = approvedLeaveDaysMap.get(leave.userId);
            if (userLeave && leave.leaveType in userLeave) {
                (userLeave as any)[leave.leaveType] += leave.days;
                userLeave.TOTAL += leave.days;
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
    });
    
    const filtered = allLeaves.filter(leave => 
      leave.year === selectedYear &&
      (filters.status === 'ALL' || leave.status === filters.status) &&
      (filters.userId === 'ALL' || leave.userId === filters.userId)
    );

    return { leaveSummary: summary, filteredLeaves: filtered, yearOptions: sortedYears };
  }, [allLeaves, users, selectedYear, filters]);

  const overLimitDetails = useMemo(() => {
    if (!approvingLeave || !hrSettings || !allLeaves || !users) return null;

    const leave = approvingLeave;
    const approvedLeavesThisYear = allLeaves.filter(l =>
        l.userId === leave.userId && l.year === leave.year && l.leaveType === leave.leaveType && l.status === 'APPROVED'
    );
    const daysTaken = approvedLeavesThisYear.reduce((sum, l) => sum + l.days, 0);

    const policy = hrSettings.leavePolicy?.leaveTypes?.[leave.leaveType];
    const entitlement = policy?.annualEntitlement ?? 0;
    
    if ((daysTaken + leave.days) > entitlement) {
        const salary = users.find(u => u.id === leave.userId)?.hr?.salaryMonthly;
        const deductionBaseDays = policy?.overLimitHandling?.salaryDeductionBaseDays ?? 26;
        let deductionAmount = 0;
        if (policy?.overLimitHandling?.mode === 'DEDUCT_SALARY' && salary) {
            const overDays = (daysTaken + leave.days) - entitlement;
            deductionAmount = (salary / deductionBaseDays) * overDays;
        }
        return { mode: policy?.overLimitHandling?.mode, amount: deductionAmount, days: (daysTaken + leave.days) - entitlement };
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
      // Manually update local state to reflect change immediately
      setAllLeaves(prevLeaves => prevLeaves.map(l => l.id === approvingLeave.id ? {...l, status: 'APPROVED', overLimit: !!overLimitDetails } as WithId<LeaveRequest> : l));
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
      // Manually update local state
      setAllLeaves(prevLeaves => prevLeaves.map(l => l.id === rejectingLeave.id ? {...l, status: 'REJECTED', rejectReason } as WithId<LeaveRequest> : l));
      toast({ title: 'ปฏิเสธใบลาสำเร็จ' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'การปฏิเสธล้มเหลว', description: error.message });
    } finally {
      setIsSubmitting(false);
      setRejectingLeave(null);
      setRejectReason('');
    }
  };

  const confirmDelete = async () => {
    if (!db || !deletingLeave) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'hrLeaves', deletingLeave.id));
      setAllLeaves(prevLeaves => prevLeaves.filter(l => l.id !== deletingLeave.id));
      toast({ title: 'ลบใบลาสำเร็จ' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'การลบล้มเหลว', description: error.message });
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
                <CardTitle>สรุปวันลา</CardTitle>
                <CardDescription>จำนวนวันลาที่อนุมัติแล้วสำหรับปีที่เลือก</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex justify-end mb-4">
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                </Select>
                </div>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead>ป่วย</TableHead>
                    <TableHead>กิจ</TableHead>
                    <TableHead>พักร้อน</TableHead>
                    <TableHead>รวม</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leaveSummary.length > 0 ? leaveSummary.map(s => (
                    <TableRow key={s.userId}>
                        <TableCell>{s.userName}</TableCell>
                        <TableCell>{s.SICK}</TableCell>
                        <TableCell>{s.BUSINESS}</TableCell>
                        <TableCell>{s.VACATION}</TableCell>
                        <TableCell className="font-bold">{s.TOTAL}</TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={5} className="text-center h-24">ยังไม่มีการลาที่อนุมัติในปีนี้</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="requests" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>คำขอลาทั้งหมด</CardTitle>
                <CardDescription>ตรวจสอบและอนุมัติ/ปฏิเสธคำขอลา</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4 mb-4">
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filters.status} onValueChange={(v) => setFilters(f => ({...f, status: v}))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem key="status-all" value="ALL">ทุกสถานะ</SelectItem>{LEAVE_STATUSES.map(s=><SelectItem key={s} value={s}>{leaveStatusLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filters.userId} onValueChange={(v) => setFilters(f => ({...f, userId: v}))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem key="user-all" value="ALL">พนักงานทั้งหมด</SelectItem>{users?.map(u=><SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}</SelectContent>
                </Select>
                </div>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>จำนวนวัน</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredLeaves.length > 0 ? filteredLeaves.map(leave => (
                    <TableRow key={leave.id}>
                        <TableCell>{leave.userName}</TableCell>
                        <TableCell>{leaveTypeLabel(leave.leaveType)}</TableCell>
                        <TableCell>{safeFormat(parseISO(leave.startDate), 'dd/MM/yy')} - {safeFormat(parseISO(leave.endDate), 'dd/MM/yy')}</TableCell>
                        <TableCell>{leave.days}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(leave.status)}>{leaveStatusLabel(leave.status)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {leave.status === 'SUBMITTED' && (
                                <>
                                  <DropdownMenuItem onSelect={() => setApprovingLeave(leave)}>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    <span>อนุมัติ</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setRejectingLeave(leave)} className="text-destructive focus:text-destructive">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    <span>ไม่อนุมัติ</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              {adminProfile?.role === 'ADMIN' && (
                                <>
                                  {leave.status === 'SUBMITTED' && <DropdownMenuSeparator />}
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setDeletingLeave(leave)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>ลบ</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="text-center h-24">ไม่พบคำขอที่ตรงกับตัวกรอง</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
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
                            <h4 className="font-semibold text-destructive">วันลาเกินสิทธิ์</h4>
                            <p className="text-destructive/80 text-sm">การอนุมัตินี้จะทำให้วันลาเกิน {overLimitDetails.days} วัน</p>
                            {overLimitDetails.mode === 'DEDUCT_SALARY' && (
                                <p className="text-destructive/80 text-sm">ยอดหักโดยประมาณ: {overLimitDetails.amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</p>
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
                    <DialogTitle>ปฏิเสธใบลา</DialogTitle>
                    <DialogDescription>กรุณาระบุเหตุผลในการปฏิเสธ</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="เหตุผลในการปฏิเสธ..."/>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRejectingLeave(null)} disabled={isSubmitting}>ยกเลิก</Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isSubmitting || !rejectReason}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการปฏิเสธ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
         <AlertDialog open={!!deletingLeave} onOpenChange={(open) => !open && setDeletingLeave(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
                <AlertDialogDescription>
                คุณต้องการลบใบลาของ <span className="font-bold">{deletingLeave?.userName}</span> ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการลบ'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </Tabs>
    </>
  );
}
