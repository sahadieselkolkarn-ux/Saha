
"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { doc, collection, query, where, orderBy, getDocs, getDoc, Timestamp, setDoc, serverTimestamp, updateDoc, addDoc } from "firebase/firestore";
import { useFirebase, useDoc, type WithId } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isAfter, startOfToday, set, startOfYear, eachDayOfInterval, isSaturday, isSunday, parseISO, differenceInCalendarDays, getYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, CalendarDays, MoreVertical, Save, AlertCircle, Eye, CalendarCheck } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { HRSettings, UserProfile, LeaveRequest, PayslipNew, Attendance, HRHoliday, AttendanceAdjustment, PayslipStatusNew, PayslipSnapshot, StoreSettings } from "@/lib/types";
import { deptLabel, payTypeLabel, newPayslipStatusLabel, leaveTypeLabel } from "@/lib/ui-labels";
import { PayslipSlipDrawer } from "@/components/payroll/PayslipSlipDrawer";
import { PayslipSlipView, calcTotals } from "@/components/payroll/PayslipSlipView";
import { computePeriodMetrics, PeriodMetrics } from "@/lib/payroll/payslip-period-metrics";
import { SsoDecisionDialog } from "@/components/payroll/SsoDecisionDialog";
import { round2, calcSsoMonthly, splitSsoHalf } from "@/lib/payroll/sso";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AttendanceAdjustmentDialog } from "@/components/attendance-adjustment-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { LEAVE_TYPES } from "@/lib/constants";

const getStatusBadgeVariant = (status?: PayslipStatusNew | string) => {
    switch (status) {
        case 'DRAFT': return 'secondary';
        case 'SENT_TO_EMPLOYEE': return 'default';
        case 'REVISION_REQUESTED': return 'destructive';
        case 'READY_TO_PAY': return 'outline';
        case 'PAID': return 'default';
        default: return 'outline';
    }
}

interface EmployeeRowData extends WithId<UserProfile> {
    periodMetrics: PeriodMetrics | null;
    periodMetricsYtd: PeriodMetrics | null;
    payslipStatus?: PayslipStatusNew | 'ไม่มีสลิป';
    snapshot: PayslipSnapshot | null;
    revisionNo?: number;
}

const leaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.string().min(1, "กรุณาเลือกวันเริ่ม"),
  endDate: z.string().min(1, "กรุณาเลือกวันสิ้นสุด"),
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
}).refine(data => !isAfter(new Date(data.startDate), new Date(data.endDate)), {
    message: 'วันที่สิ้นสุดต้องไม่มาก่อนวันเริ่มต้น',
    path: ['endDate'],
});

type LeaveFormData = z.infer<typeof leaveSchema>;

function LeaveManageDialog({ 
  targetUser,
  isOpen, 
  onClose, 
  onConfirm, 
  isSubmitting 
}: { 
  targetUser: WithId<UserProfile>,
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
      reason: 'บันทึกด่วนจากหน้าสลิปเงินเดือน',
    }
  });

  useEffect(() => {
    if (isOpen) {
        form.reset({
          leaveType: 'SICK',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          reason: 'บันทึกด่วนจากหน้าสลิปเงินเดือน',
        });
    }
  }, [form, isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างรายการลาใหม่ (โดย Admin)</DialogTitle>
            <DialogDescription>
              พนักงาน: {targetUser?.displayName}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form id="payroll-leave-form" onSubmit={form.handleSubmit(onConfirm)} className="space-y-4 py-4">
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
            <Button type="submit" form="payroll-leave-form" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : 'สร้างและอนุมัติทันที'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

export default function HRGeneratePayslipsPage() {
    const { db, firebaseApp } = useFirebase();
    const { toast } = useToast();
    const { profile: adminProfile } = useAuth();
    const printFrameRef = useRef<HTMLIFrameElement | null>(null);

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [period, setPeriod] = useState<1 | 2>(new Date().getDate() <= 15 ? 1 : 2);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isActing, setIsActing] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const [employeeData, setEmployeeData] = useState<EmployeeRowData[]>([]);
    const [ssoDecision, setSsoDecision] = useState<any>(null);
    const [isSsoDecisionDialogOpen, setIsSsoDecisionDialogOpen] = useState(false);
    
    const [editingPayslip, setEditingPayslip] = useState<EmployeeRowData | null>(null);
    const [drawerSnapshot, setDrawerSnapshot] = useState<PayslipSnapshot | null>(null);
    const [otherPeriodSnapshot, setOtherPeriodSnapshot] = useState<PayslipSnapshot | null>(null);

    // Day selection states for adjustment
    const [isDaySelectOpen, setIsDaySelectOpen] = useState(false);
    const [selectedDayToAdjust, setSelectedDayToAdjust] = useState<any>(null);
    const [isLeaveManageOpen, setIsLeaveManageOpen] = useState(false);
    
    const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
    const { data: hrSettings } = useDoc<HRSettings>(settingsDocRef);

    const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
    const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
    
    const hasPermission = useMemo(() => adminProfile?.role === 'ADMIN' || adminProfile?.role === 'MANAGER' || adminProfile?.department === 'MANAGEMENT', [adminProfile]);

    const handleFetchEmployees = useCallback(async (autoOpenUid?: string) => {
        if (!db || !hrSettings || !adminProfile) {
            return;
        }
        setIsLoading(true);
        setError(null);
        setEmployeeData([]);
        setSsoDecision(null);

        try {
            const period1StartDay = hrSettings.payroll?.period1Start || 1;
            const period1EndDay = hrSettings.payroll?.period1End || 15;
            const period2StartDay = hrSettings.payroll?.period2Start || 16;
            
            const periodStartDate = period === 1 
              ? set(currentMonth, { date: period1StartDay })
              : set(currentMonth, { date: period2StartDay });
            const periodEndDate = period === 1 
              ? set(currentMonth, { date: period1EndDay })
              : endOfMonth(currentMonth);
            
            const payPeriod = { start: periodStartDate, end: periodEndDate };
            const year = currentMonth.getFullYear();
            
            const ytdStart = startOfYear(currentMonth);
            const ytdStartStr = format(ytdStart, 'yyyy-MM-dd');
            const periodEndStr = format(payPeriod.end, 'yyyy-MM-dd');
            
            const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
            
            // SSO Decision Logic - Monthly isolation
            const monthBatchId = `${format(currentMonth, 'yyyy-MM')}`;
            const batchDocRef = doc(db, 'payrollBatches', monthBatchId);
            const batchDocSnap = await getDoc(batchDocRef);
            let finalSsoDecision = batchDocSnap.exists() ? batchDocSnap.data().ssoDecision : null;
            
            if (!finalSsoDecision && period === 1) {
                // Auto-lock for Period 1
                finalSsoDecision = { 
                    employeePercent: Number(hrSettings.sso?.employeePercent ?? 0),
                    employerPercent: Number(hrSettings.sso?.employerPercent ?? 0),
                    monthlyMinBase: Number(hrSettings.sso?.monthlyMinBase ?? 0),
                    monthlyCap: Number(hrSettings.sso?.monthlyCap ?? 0),
                    source: 'AUTO_LOCK',
                    decidedAt: Timestamp.now(),
                    decidedByUid: adminProfile.uid,
                    decidedByName: adminProfile.displayName
                };
                await setDoc(batchDocRef, { ssoDecision: finalSsoDecision }, { merge: true });
            } else if (period === 2 && finalSsoDecision) {
                // Improved SSO Change Detection (Fuzzy comparison to avoid typo alerts)
                const checkDiff = (v1: any, v2: any) => Math.abs(Number(v1 || 0) - Number(v2 || 0)) > 0.01;
                
                const hasChanged = 
                    checkDiff(finalSsoDecision.employeePercent, hrSettings.sso?.employeePercent) ||
                    checkDiff(finalSsoDecision.employerPercent, hrSettings.sso?.employerPercent) ||
                    checkDiff(finalSsoDecision.monthlyMinBase, hrSettings.sso?.monthlyMinBase) ||
                    checkDiff(finalSsoDecision.monthlyCap, hrSettings.sso?.monthlyCap);
                
                if (hasChanged) {
                    setIsSsoDecisionDialogOpen(true);
                }
            }
            setSsoDecision(finalSsoDecision);

            const usersQuery = query(collection(db, 'users'), where('status', '==', 'ACTIVE'));
            const holidaysQuery = query(collection(db, 'hrHolidays'));
            const leavesQuery = query(collection(db, 'hrLeaves'), where('year', '==', year), where('status', '==', 'APPROVED'));
            const attendancePeriodQuery = query(collection(db, 'attendance'), where('timestamp', '>=', payPeriod.start), where('timestamp', '<=', payPeriod.end));
            const adjustmentsPeriodQuery = query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', format(payPeriod.start, 'yyyy-MM-dd')), where('date', '<=', format(payPeriod.end, 'yyyy-MM-dd')));
            const attendanceYtdQuery = query(collection(db, 'attendance'), where('timestamp', '>=', ytdStart), where('timestamp', '<=', payPeriod.end));
            const adjustmentsYtdQuery = query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', ytdStartStr), where('date', '<=', periodEndStr));
            const payslipsQuery = query(collection(db, 'payrollBatches', payrollBatchId, 'payslips'));

            const [
                usersSnap, holidaysSnap, leavesSnap, 
                attendancePeriodSnap, adjustmentsPeriodSnap,
                attendanceYtdSnap, adjustmentsYtdSnap,
                payslipsSnap
            ] = await Promise.all([
                getDocs(usersQuery),
                getDocs(holidaysQuery),
                getDocs(leavesQuery),
                getDocs(attendancePeriodQuery),
                getDocs(adjustmentsPeriodQuery),
                getDocs(attendanceYtdQuery),
                getDocs(adjustmentsYtdQuery),
                getDocs(payslipsQuery),
            ]);

            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
            const activeUsers = allUsers.filter(u => u?.hr?.payType === 'MONTHLY' || u?.hr?.payType === 'DAILY');

            const allHolidays = new Map(
              holidaysSnap.docs.map(d => {
                const raw = d.data().date;
                const key = typeof raw === "string" ? raw.trim().slice(0, 10) : (raw?.toDate ? format(raw.toDate(), "yyyy-MM-dd") : "");
                return [key, d.data().name];
              }).filter(([k]) => !!k)
            );
            
            const allLeavesYear = leavesSnap.docs.map(d => d.data() as LeaveRequest);
            const allAttendancePeriod = attendancePeriodSnap.docs.map(d => d.data() as Attendance);
            const allAdjustmentsPeriod = adjustmentsPeriodSnap.docs.map(d => ({id: d.id, ...d.data()} as WithId<AttendanceAdjustment>));
            const allAttendanceYtd = attendanceYtdSnap.docs.map(d => d.data() as Attendance);
            const allAdjustmentsYtd = adjustmentsYtdSnap.docs.map(d => ({id: d.id, ...d.data()} as WithId<AttendanceAdjustment>));
            const existingPayslips = new Map(payslipsSnap.docs.map(d => [d.id, d.data() as PayslipNew]));

            const data = activeUsers.map(user => {
                const userLeaves = allLeavesYear.filter(l => l.userId === user.id);
                const userAttendanceThisPeriod = allAttendancePeriod.filter(a => a.userId === user.id);
                const userAdjustmentsThisPeriod = allAdjustmentsPeriod.filter(a => a.userId === user.id);
                const userAttendanceYtd = allAttendanceYtd.filter(a => a.userId === user.id);
                const userAdjustmentsYtd = allAdjustmentsYtd.filter(a => a.userId === user.id);

                const periodMetrics = computePeriodMetrics({ user, payType: user.hr!.payType!, period: payPeriod, hrSettings, holidays: allHolidays, userLeavesApprovedYear: userLeaves, userAttendance: userAttendanceThisPeriod, userAdjustments: userAdjustmentsThisPeriod, today: new Date() });
                const periodMetricsYtd = computePeriodMetrics({ user, payType: user.hr!.payType!, period: {start: ytdStart, end: payPeriod.end }, hrSettings, holidays: allHolidays, userLeavesApprovedYear: userLeaves, userAttendance: userAttendanceYtd, userAdjustments: userAdjustmentsYtd, today: new Date() });
                const existingSlip = existingPayslips.get(user.id);
                
                return { ...user, periodMetrics, periodMetricsYtd, payslipStatus: existingSlip?.status ?? 'ไม่มีสลิป', snapshot: existingSlip?.snapshot ?? null, revisionNo: existingSlip?.revisionNo };
            });
            setEmployeeData(data);

            if (autoOpenUid) {
                const target = data.find(e => e.id === autoOpenUid);
                if (target) {
                    handleOpenDrawer(target, true);
                }
            }
        } catch (e: any) {
            setError(e);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsLoading(false);
        }
    }, [db, hrSettings, currentMonth, period, adminProfile, toast]);
    
    const handleSsoDecisionConfirm = async (decision: any) => {
        if (!db || !adminProfile) return;
        const monthBatchId = `${format(currentMonth, 'yyyy-MM')}`;
        const batchRef = doc(db, 'payrollBatches', monthBatchId);
        
        const finalDecision = {
            ...decision,
            decidedAt: serverTimestamp(),
            decidedByUid: adminProfile.uid,
            decidedByName: adminProfile.displayName
        };

        await setDoc(batchRef, {
            ssoDecision: finalDecision,
        }, { merge: true });
        
        setSsoDecision(decision);
        setIsSsoDecisionDialogOpen(false);
        toast({ title: 'อัปเดตการตั้งค่า SSO สำหรับเดือนนี้แล้ว', description: 'กรุณากดดึงข้อมูลอีกครั้งเพื่อใช้ค่าใหม่นี้ค่ะ' });
    };

    const handleOpenDrawer = async (user: EmployeeRowData, isAuto: boolean = false) => {
        if (!db) return;
        setEditingPayslip(user);
        const { periodMetrics, periodMetricsYtd, snapshot: existingSnapshot, hr } = user;

        if (!hr?.payType || hr.payType === 'NOPAY' || hr.payType === 'MONTHLY_NOSCAN') return;
        if (!periodMetrics || !periodMetricsYtd) { toast({variant: 'destructive', title: 'คำนวณไม่สำเร็จ', description: 'ไม่สามารถคำนวณข้อมูลการทำงานของพนักงานได้'}); setEditingPayslip(null); return; }
        
        // Fetch Other Period Data
        const otherPeriodNo = period === 1 ? 2 : 1;
        const otherBatchId = `${format(currentMonth, 'yyyy-MM')}-${otherPeriodNo}`;
        const otherPayslipRef = doc(db, 'payrollBatches', otherBatchId, 'payslips', user.id);
        const otherPayslipSnap = await getDoc(otherPayslipRef);
        const otherSnapshot = otherPayslipSnap.exists() ? (otherPayslipSnap.data().snapshot as PayslipSnapshot) : null;
        setOtherPeriodSnapshot(otherSnapshot);

        let basePay = 0;
        if (hr.payType === 'DAILY') {
            if (!hr.salaryDaily || hr.salaryDaily <= 0) { toast({variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: `กรุณาตั้งค่าแรงรายวันสำหรับ ${user.displayName} ก่อน`}); setEditingPayslip(null); return; }
            basePay = (hr.salaryDaily || 0) * periodMetrics.attendanceSummary.payableUnits;
        } else {
            basePay = (hr?.salaryMonthly ?? 0) / 2;
        }

        const manualAdditions = existingSnapshot?.additions?.filter(a => !a.name.startsWith('[AUTO]')) ?? [];
        const manualDeductions = existingSnapshot?.deductions?.filter(d => !d.name.startsWith('[AUTO]')) ?? [];
        
        let initialSnapshot: PayslipSnapshot = {
            basePay: existingSnapshot?.basePay ?? basePay,
            netPay: 0,
            additions: manualAdditions,
            deductions: [...manualDeductions, ...periodMetrics.autoDeductions],
            attendanceSummary: periodMetrics.attendanceSummary,
            leaveSummary: periodMetrics.leaveSummary,
            attendanceSummaryYtd: periodMetricsYtd.attendanceSummary,
            leaveSummaryYtd: periodMetricsYtd.leaveSummary,
            calcNotes: periodMetrics.calcNotes,
        };
        
        // SSO Calculation
        if (ssoDecision && (hr.payType === 'MONTHLY' || hr.payType === 'DAILY')) {
            const { employeePercent = 0, monthlyMinBase = 0, monthlyCap = Infinity } = ssoDecision;
            let ssoAmountThisPeriod = 0;

            if (hr.payType === 'MONTHLY' && hr.salaryMonthly) {
                const ssoMonthly = calcSsoMonthly(hr.salaryMonthly, employeePercent, monthlyMinBase, monthlyCap);
                const { p1, p2 } = splitSsoHalf(ssoMonthly);

                if (period === 1) {
                    ssoAmountThisPeriod = p1;
                } else { 
                    const p1Deducted = otherSnapshot?.deductions?.find((d:any) => d.name === '[AUTO] ประกันสังคม')?.amount ?? 0;
                    ssoAmountThisPeriod = Math.max(0, round2(ssoMonthly - p1Deducted));
                }
            } else if (hr.payType === 'DAILY' && hr.salaryDaily) {
                // For Daily: Based on actual work days
                if (period === 1) {
                    const incomeP1 = hr.salaryDaily * periodMetrics.attendanceSummary.payableUnits;
                    // For P1 daily, we calculate based on income. P2 will handle the monthly total/cap.
                    ssoAmountThisPeriod = round2(incomeP1 * (employeePercent / 100));
                } else {
                    // Period 2: Calculate total monthly income
                    const incomeP1 = hr.salaryDaily * (otherSnapshot?.attendanceSummary?.payableUnits || 0);
                    const incomeP2 = hr.salaryDaily * periodMetrics.attendanceSummary.payableUnits;
                    const totalMonthlyIncome = incomeP1 + incomeP2;
                    
                    const totalSsoMonthly = calcSsoMonthly(totalMonthlyIncome, employeePercent, monthlyMinBase, monthlyCap);
                    const p1Deducted = otherSnapshot?.deductions?.find((d:any) => d.name === '[AUTO] ประกันสังคม')?.amount ?? 0;
                    
                    ssoAmountThisPeriod = Math.max(0, round2(totalSsoMonthly - p1Deducted));
                }
            }
            
            initialSnapshot.deductions = initialSnapshot.deductions.filter(d => d.name !== '[AUTO] ประกันสังคม');
            if (ssoAmountThisPeriod > 0) {
                initialSnapshot.deductions.push({ 
                    name: '[AUTO] ประกันสังคม', 
                    amount: ssoAmountThisPeriod, 
                    notes: hr.payType === 'DAILY' ? `คำนวณจากวันทำงานจริง (เรท ${employeePercent}%)` : `หักครึ่งงวด (เดือนนี้ใช้เรท ${employeePercent}%)` 
                });
            }
        }

        const totals = calcTotals(initialSnapshot);
        setDrawerSnapshot({ ...initialSnapshot, netPay: totals.netPay });
    };
    
    const handleSaveDraft = async () => {
        if (!db || !adminProfile || !editingPayslip || !drawerSnapshot) return;
        setIsActing(editingPayslip.id);
        
        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const batchRef = doc(db, 'payrollBatches', payrollBatchId);
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', editingPayslip.id);

        try {
            await setDoc(batchRef, { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1, periodNo: period, createdAt: serverTimestamp(), createdByUid: adminProfile.uid, createdByName: adminProfile.displayName }, { merge: true });
            const totals = calcTotals(drawerSnapshot);
            const finalSnapshot = { ...drawerSnapshot, netPay: totals.netPay };

            await setDoc(payslipRef, { status: 'DRAFT', snapshot: finalSnapshot, userId: editingPayslip.id, userName: editingPayslip.displayName, batchId: payrollBatchId, revisionNo: editingPayslip.revisionNo || 0, updatedAt: serverTimestamp() }, { merge: true });
            setEmployeeData(prev => prev.map(e => e.id === editingPayslip.id ? { ...e, payslipStatus: 'DRAFT', snapshot: finalSnapshot, revisionNo: editingPayslip.revisionNo || 0 } : e));
            toast({ title: `บันทึกสลิปร่างสำหรับ ${editingPayslip.displayName} สำเร็จ` });
            setEditingPayslip(null); setDrawerSnapshot(null);
        } catch (e: any) { toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message }); } finally { setIsActing(null); }
    };
    
    const handleSaveAndSend = async () => {
        if (!db || !adminProfile || !editingPayslip || !drawerSnapshot) return;
        setIsActing(editingPayslip.id);

        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const batchRef = doc(db, 'payrollBatches', payrollBatchId);
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', editingPayslip.id);

        try {
            await setDoc(batchRef, { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1, periodNo: period, createdAt: serverTimestamp(), createdByUid: adminProfile.uid, createdByName: adminProfile.displayName }, { merge: true });
            const totals = calcTotals(drawerSnapshot);
            const finalSnapshot = { ...drawerSnapshot, netPay: totals.netPay };
            const nextRevisionNo = (editingPayslip.revisionNo || 0) + 1;

            await setDoc(payslipRef, { status: 'SENT_TO_EMPLOYEE', snapshot: finalSnapshot, userId: editingPayslip.id, userName: editingPayslip.displayName, batchId: payrollBatchId, revisionNo: nextRevisionNo, updatedAt: serverTimestamp(), sentAt: serverTimestamp(), lockedAt: serverTimestamp() }, { merge: true });
            setEmployeeData(prev => prev.map(e => e.id === editingPayslip.id ? { ...e, payslipStatus: 'SENT_TO_EMPLOYEE', snapshot: finalSnapshot, revisionNo: nextRevisionNo } : e));
            toast({ title: `ส่งสลิปให้ ${editingPayslip.displayName} แล้ว` });
            setEditingPayslip(null); setDrawerSnapshot(null);
        } catch (e: any) { toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message }); } finally { setIsActing(null); }
    };

    const handlePrintInDrawer = () => {
        if (!editingPayslip || !drawerSnapshot || !storeSettings) return;
        
        try {
          const frame = printFrameRef.current;
          if (!frame) return;
      
          const totals = calcTotals(drawerSnapshot);
          const periodLabelText = `งวด ${period} (${format(currentMonth, 'MMMM yyyy')})`;
          
          const html = `
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>Payslip ${editingPayslip.displayName}</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.5; color: #333; margin: 0; padding: 0; }
              .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
              .header h1 { margin: 0; font-size: 20px; color: #000; }
              .header p { margin: 5px 0 0; font-size: 12px; color: #666; }
              .doc-title { text-align: center; margin-bottom: 20px; }
              .doc-title h2 { margin: 0; font-size: 18px; text-decoration: underline; }
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
              .section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; margin-top: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f9f9f9; }
              .text-right { text-align: right; }
              .total-row { font-weight: bold; background-color: #eee; }
              .footer { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; text-align: center; }
              .signature { border-top: 1px solid #333; padding-top: 5px; margin-top: 40px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${storeSettings.taxName || 'ห้างหุ้นส่วนจำกัด สหดีเซลกลการ'}</h1>
              <p>${storeSettings.taxAddress || ''}</p>
              <p>โทร: ${storeSettings.phone || ''}</p>
            </div>
            <div class="doc-title">
              <h2>ใบแจ้งยอดเงินเดือน / PAY SLIP</h2>
            </div>
            <div class="info-grid">
              <div><strong>ชื่อพนักงาน:</strong> ${editingPayslip.displayName}</div>
              <div class="text-right"><strong>ประจำงวด:</strong> ${periodLabelText}</div>
              <div><strong>แผนก:</strong> ${deptLabel(editingPayslip.department)}</div>
              <div class="text-right"><strong>ประเภท:</strong> ${payTypeLabel(editingPayslip.hr?.payType)}</div>
            </div>
            
            <div class="section-title">รายได้ / Earnings</div>
            <table>
              <thead><tr><th>รายการ</th><th class="text-right">จำนวนเงิน (บาท)</th></tr></thead>
              <tbody>
                <tr><td>เงินเดือนพื้นฐาน / Base Salary (งวด)</td><td class="text-right">${totals.basePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                ${(drawerSnapshot.additions || []).map(a => `<tr><td>${a.name}</td><td class="text-right">${a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`).join('')}
                <tr class="total-row"><td>รวมรายได้ / Total Earnings</td><td class="text-right">${(totals.basePay + totals.addTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              </tbody>
            </table>

            <div class="section-title">รายการหัก / Deductions</div>
            <table>
              <thead><tr><th>รายการ</th><th class="text-right">จำนวนเงิน (บาท)</th></tr></thead>
              <tbody>
                ${(drawerSnapshot.deductions || []).map(d => `<tr><td>${d.name}</td><td class="text-right">${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`).join('') || '<tr><td>-</td><td class="text-right">0.00</td></tr>'}
                <tr class="total-row"><td>รวมรายการหัก / Total Deductions</td><td class="text-right">${totals.dedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
              </tbody>
            </table>

            <div style="margin-top: 20px; padding: 10px; border: 2px solid #333; text-align: right; font-size: 18px; font-weight: bold;">
              เงินได้สุทธิ / NET PAY: <span style="margin-left: 20px;">${totals.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
            </div>

            <div class="footer">
              <div>
                <div class="signature"></div>
                <p>ผู้อนุมัติจ่าย / Authorized Signature</p>
              </div>
              <div>
                <div class="signature"></div>
                <p>ผู้รับเงิน / Employee Signature</p>
              </div>
            </div>
          </body>
          </html>`;
      
          frame.onload = () => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          };
          frame.srcdoc = html;
        } catch (e) {
          toast({ variant: 'destructive', title: 'ไม่สามารถพิมพ์ได้' });
        }
    };

    const periodDaysList = useMemo(() => {
        if (!hrSettings) return [];
        const p1EndDay = hrSettings.payroll?.period1End || 15;
        const p2StartDay = hrSettings.payroll?.period2Start || 16;
        
        const start = period === 1 ? startOfMonth(currentMonth) : set(currentMonth, { date: p2StartDay });
        const end = period === 1 ? set(currentMonth, { date: p1EndDay }) : endOfMonth(currentMonth);
        
        return eachDayOfInterval({ start, end });
    }, [currentMonth, period, hrSettings]);

    const handleAdminLeaveSave = async (data: LeaveFormData) => {
        if (!db || !adminProfile || !editingPayslip) return;
        setIsActing(editingPayslip.id);
        try {
            const days = differenceInCalendarDays(new Date(data.endDate), new Date(data.startDate)) + 1;
            const year = getYear(new Date(data.startDate));

            await addDoc(collection(db, 'hrLeaves'), {
                userId: editingPayslip.id,
                userName: editingPayslip.displayName,
                ...data,
                days,
                year,
                status: 'APPROVED', 
                approvedByName: adminProfile.displayName,
                approvedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: "สร้างและอนุมัติใบลาเรียบร้อย" });
            setIsLeaveManageOpen(false);
            // Re-fetch to update metrics and recalculate
            handleFetchEmployees(editingPayslip.id);
        } catch (e: any) {
            toast({ variant: 'destructive', title: "ทำรายการไม่สำเร็จ", description: e.message });
        } finally {
            setIsActing(null);
        }
    };

    if (!hasPermission) return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle></CardHeader></Card>;

    const periodLabel = `งวด ${period} (${format(currentMonth, 'MMMM yyyy')})`;

    return (
        <>
            <PageHeader title="สร้างสลิปเงินเดือน" description="คำนวณ สรุป สาย ขาด ลา และสร้างสลิปเงินเดือนประจำงวด" />
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <CardTitle className="text-lg">เลือกช่วงเวลางวดบัญชี</CardTitle>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft /></Button>
                            <span className="font-semibold text-lg text-center w-32">{format(currentMonth, 'MMMM yyyy')}</span>
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}><ChevronRight /></Button>
                            <Select value={period.toString()} onValueChange={(v) => setPeriod(Number(v) as 1 | 2)}>
                                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">งวดที่ 1 ({hrSettings?.payroll?.period1Start}-{hrSettings?.payroll?.period1End})</SelectItem>
                                    <SelectItem value="2">งวดที่ 2 ({hrSettings?.payroll?.period2Start}-สิ้นเดือน)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => handleFetchEmployees()} disabled={isLoading} className="shadow-md">
                        {isLoading ? <Loader2 className="animate-spin mr-2" /> : <CalendarDays className="mr-2"/>}
                        ดึงข้อมูลพนักงาน (รายเดือน/รายวัน)
                    </Button>
                </CardContent>
            </Card>

            {isLoading && <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}
            {error && <Card className="mt-6 bg-destructive/10 border-destructive/20"><CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertCircle/> เกิดข้อผิดพลาด</CardTitle><CardDescription className="text-destructive">{error.message}</CardDescription></CardHeader></Card>}
            
            {employeeData.length > 0 && (
                <Card className="mt-6">
                    <CardHeader><CardTitle>รายชื่อที่พบบนระบบ ({employeeData.length} ท่าน)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader><TableRow><TableHead className="pl-6">ชื่อพนักงาน</TableHead><TableHead>แผนก</TableHead><TableHead>ประเภท</TableHead><TableHead className="text-right">วันทำงาน</TableHead><TableHead>สถานะสลิป</TableHead><TableHead className="text-right pr-6">จัดการ</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {employeeData.map(user => (
                                    <TableRow key={user.id} className="hover:bg-muted/30">
                                        <TableCell className="pl-6 font-medium">{user.displayName}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{deptLabel(user.department)}</TableCell>
                                        <TableCell><Badge variant="outline" className="text-[10px] font-normal">{payTypeLabel(user.hr?.payType)}</Badge></TableCell>
                                        <TableCell className="text-right font-bold text-primary">{user.periodMetrics?.attendanceSummary.payableUnits ?? '-'}</TableCell>
                                        <TableCell><Badge variant={getStatusBadgeVariant(user.payslipStatus)}>{newPayslipStatusLabel(user.payslipStatus) || user.payslipStatus}</Badge></TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="ghost" size="icon" onClick={() => void handleOpenDrawer(user)} disabled={isActing !== null || user.payslipStatus === 'PAID'} title="สร้างหรือแก้ไขสลิป">
                                                {user.snapshot ? <Eye className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {editingPayslip && drawerSnapshot && (
                <PayslipSlipDrawer
                    open={!!editingPayslip} onOpenChange={(open) => !open && setEditingPayslip(null)}
                    title="แบบฟอร์มสลิปเงินเดือน" description={`${editingPayslip.displayName} - ${periodLabel}`}
                    onPrint={handlePrintInDrawer}
                    footerActions={ (editingPayslip.payslipStatus !== 'PAID' && editingPayslip.payslipStatus !== 'READY_TO_PAY') && (
                        <>
                          <Button variant="outline" onClick={() => setEditingPayslip(null)} disabled={isActing === editingPayslip.id}>ยกเลิก</Button>
                          <Button onClick={handleSaveDraft} disabled={isActing === editingPayslip.id} variant="secondary"><Save className="mr-2 h-4 w-4"/>บันทึกร่าง</Button>
                          <Button onClick={handleSaveAndSend} disabled={isActing === editingPayslip.id} className="bg-primary">{isActing === editingPayslip.id ? <Loader2 className="mr-2 animate-spin h-4 w-4"/> : <Send className="mr-2 h-4 w-4"/>}บันทึกและส่งให้พนักงาน</Button>
                        </>
                      )
                    }
                >
                    <PayslipSlipView 
                        userName={editingPayslip.displayName} 
                        periodLabel={periodLabel} 
                        snapshot={drawerSnapshot} 
                        otherPeriodSnapshot={otherPeriodSnapshot}
                        currentPeriodNo={period}
                        userProfile={editingPayslip}
                        mode="edit" 
                        payType={editingPayslip.hr?.payType} 
                        onChange={setDrawerSnapshot}
                        onAdjustAttendance={() => setIsDaySelectOpen(true)}
                        onAdjustLeave={() => setIsLeaveManageOpen(true)}
                    />
                </PayslipSlipDrawer>
            )}

            {/* Select Day Dialog */}
            <Dialog open={isDaySelectOpen} onOpenChange={setIsDaySelectOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>เลือกวันที่ต้องการปรับปรุงเวลา</DialogTitle>
                        <DialogDescription>สำหรับ: {editingPayslip?.displayName}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-80 pr-4">
                        <div className="space-y-1">
                            {periodDaysList.map(day => (
                                <Button 
                                    key={day.toISOString()} 
                                    variant="ghost" 
                                    className="w-full justify-between"
                                    onClick={() => {
                                        setSelectedDayToAdjust({ date: day });
                                        setIsDaySelectOpen(false);
                                    }}
                                >
                                    <span>{format(day, 'dd/MM/yyyy')}</span>
                                    <span className="text-[10px] text-muted-foreground">{format(day, 'EEEE')}</span>
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Adjustment Dialog */}
            {selectedDayToAdjust && editingPayslip && (
                <AttendanceAdjustmentDialog
                    isOpen={!!selectedDayToAdjust}
                    onOpenChange={(open) => !open && setSelectedDayToAdjust(null)}
                    dayInfo={{ date: selectedDayToAdjust.date, status: 'NO_DATA' }} // Re-computed in dialog
                    user={editingPayslip}
                    onSaved={() => {
                        handleFetchEmployees(editingPayslip.id);
                    }}
                />
            )}

            {/* Leave Manage Dialog */}
            {editingPayslip && (
                <LeaveManageDialog
                    targetUser={editingPayslip}
                    isOpen={isLeaveManageOpen}
                    onClose={() => setIsLeaveManageOpen(false)}
                    onConfirm={handleAdminLeaveSave}
                    isSubmitting={isActing === editingPayslip.id}
                />
            )}

             {isSsoDecisionDialogOpen && ssoDecision && hrSettings?.sso && (
                <SsoDecisionDialog
                    isOpen={isSsoDecisionDialogOpen}
                    onClose={() => setIsSsoDecisionDialogOpen(false)}
                    onConfirm={handleSsoDecisionConfirm}
                    batchDecision={ssoDecision}
                    currentSettings={hrSettings.sso}
                />
             )}

             <iframe ref={printFrameRef} className="hidden" title="Print Frame" />
        </>
    );
}
