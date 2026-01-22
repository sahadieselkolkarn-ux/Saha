"use client";

import { useState, useMemo } from "react";
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, where } from "firebase/firestore";
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
import { Loader2, CheckCircle, XCircle, ShieldAlert } from "lucide-react";
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
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { Badge } from "@/components/ui/badge";

export default function ManagementHRLeavesPage() {
  const { db } = useFirebase();
  const { profile: adminProfile } = useAuth();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [filters, setFilters] = useState({ status: 'ALL', userId: 'ALL' });
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingLeave, setApprovingLeave] = useState<LeaveRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
  
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), orderBy('displayName', 'asc')) : null, [db]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);

  const leavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), orderBy('createdAt', 'desc')) : null, [db]);
  const { data: allLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(leavesQuery);

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
      await updateDoc(doc(db, 'hrLeaves', approvingLeave.id), {
        status: 'APPROVED',
        approvedByName: adminProfile.displayName,
        approvedAt: serverTimestamp(),
        overLimit: !!overLimitDetails,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Leave Approved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
      setApprovingLeave(null);
    }
  };

  const handleReject = async () => {
    if (!db || !adminProfile || !rejectingLeave || !rejectReason) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'hrLeaves', rejectingLeave.id), {
        status: 'REJECTED',
        rejectedByName: adminProfile.displayName,
        rejectedAt: serverTimestamp(),
        rejectReason,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Leave Rejected' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Rejection Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
      setRejectingLeave(null);
      setRejectReason('');
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
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="requests">All Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>Leave Summary</CardTitle>
                <CardDescription>Total approved leave days for the selected year.</CardDescription>
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
                    <TableHead>Employee</TableHead>
                    <TableHead>Sick</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Vacation</TableHead>
                    <TableHead>Total</TableHead>
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
                    )) : <TableRow><TableCell colSpan={5} className="text-center h-24">No approved leaves this year.</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="requests" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>All Leave Requests</CardTitle>
                <CardDescription>Review and approve/reject leave requests.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4 mb-4">
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filters.status} onValueChange={(v) => setFilters(f => ({...f, status: v}))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem key="status-all" value="ALL">All Statuses</SelectItem>{LEAVE_STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filters.userId} onValueChange={(v) => setFilters(f => ({...f, userId: v}))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem key="user-all" value="ALL">All Employees</SelectItem>{users?.map(u=><SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}</SelectContent>
                </Select>
                </div>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredLeaves.length > 0 ? filteredLeaves.map(leave => (
                    <TableRow key={leave.id}>
                        <TableCell>{leave.userName}</TableCell>
                        <TableCell>{leave.leaveType}</TableCell>
                        <TableCell>{safeFormat(parseISO(leave.startDate), 'dd/MM/yy')} - {safeFormat(parseISO(leave.endDate), 'dd/MM/yy')}</TableCell>
                        <TableCell>{leave.days}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(leave.status)}>{leave.status}</Badge></TableCell>
                        <TableCell className="space-x-2">
                        {leave.status === 'SUBMITTED' && (
                            <>
                            <Button size="sm" variant="outline" onClick={() => setApprovingLeave(leave)}><CheckCircle className="h-4 w-4 mr-2"/>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => setRejectingLeave(leave)}><XCircle className="h-4 w-4 mr-2"/>Reject</Button>
                            </>
                        )}
                        </TableCell>
                    </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="text-center h-24">No requests match filters.</TableCell></TableRow>}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        <AlertDialog open={!!approvingLeave} onOpenChange={(open) => !open && setApprovingLeave(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
                <AlertDialogDescription>
                Are you sure you want to approve this leave request for <span className="font-bold">{approvingLeave?.userName}</span>?
                </AlertDialogDescription>
            </AlertDialogHeader>
            {overLimitDetails && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-destructive">Leave Limit Exceeded</h4>
                            <p className="text-destructive/80 text-sm">Approving this will exceed the annual limit by {overLimitDetails.days} day(s).</p>
                            {overLimitDetails.mode === 'DEDUCT_SALARY' && (
                                <p className="text-destructive/80 text-sm">Estimated deduction: {overLimitDetails.amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleApprove} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Approve'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <Dialog open={!!rejectingLeave} onOpenChange={(open) => !open && setRejectingLeave(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Leave Request</DialogTitle>
                    <DialogDescription>Please provide a reason for rejecting the request.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..."/>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRejectingLeave(null)} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isSubmitting || !rejectReason}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Reject'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </Tabs>
    </>
  );
}
