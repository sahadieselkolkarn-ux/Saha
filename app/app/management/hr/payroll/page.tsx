"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { doc, collection, query, where, orderBy, getDocs, getDoc, Timestamp, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isAfter, startOfToday, set, startOfYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, CalendarDays, MoreVertical, Save, AlertCircle } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { HRSettings, UserProfile, LeaveRequest, PayslipNew, Attendance, HRHoliday, AttendanceAdjustment, PayslipStatusNew, PayslipSnapshot } from "@/lib/types";
import { deptLabel, payTypeLabel, newPayslipStatusLabel } from "@/lib/ui-labels";
import { WithId } from "@/firebase/firestore/use-collection";
import { PayslipSlipDrawer } from "@/components/payroll/PayslipSlipDrawer";
import { PayslipSlipView, calcTotals } from "@/components/payroll/PayslipSlipView";
import { formatPayslipAsText, formatPayslipAsJson } from "@/lib/payroll/formatPayslipCopy";
import { computePeriodMetrics, PeriodMetrics } from "@/lib/payroll/payslip-period-metrics";
import { SsoDecisionDialog } from "@/components/payroll/SsoDecisionDialog";
import { round2, calcSsoMonthly, splitSsoHalf } from "@/lib/payroll/sso";

const getStatusBadgeVariant = (status?: PayslipStatusNew) => {
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


export default function HRGeneratePayslipsPage() {
    const { db } = useFirebase();
    const { toast } = useToast();
    const { profile: adminProfile } = useAuth();
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
    
    const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
    const { data: hrSettings } = useDoc<HRSettings>(settingsDocRef);
    
    const hasPermission = useMemo(() => adminProfile?.role === 'ADMIN' || adminProfile?.department === 'MANAGEMENT', [adminProfile]);

    const handleFetchEmployees = useCallback(async () => {
        if (!db || !hrSettings) {
            toast({ variant: 'destructive', title: 'ยังไม่พร้อม', description: 'ไม่สามารถโหลดการตั้งค่า HR ได้' });
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
            
            // SSO Decision Logic
            const monthBatchId = `${format(currentMonth, 'yyyy-MM')}`;
            const batchDocRef = doc(db, 'payrollBatches', monthBatchId);
            const batchDocSnap = await getDoc(batchDocRef);
            let finalSsoDecision = batchDocSnap.exists() ? batchDocSnap.data().ssoDecision : null;
            const currentSsoHash = JSON.stringify(hrSettings.sso || {});
            
            if (!finalSsoDecision && period === 1) {
                finalSsoDecision = { ...hrSettings.sso, source: 'AUTO_LOCK' };
            } else if (period === 2) {
                 if (finalSsoDecision) {
                    if (currentSsoHash !== batchDocSnap.data().ssoDecisionHash) {
                        setIsSsoDecisionDialogOpen(true);
                    }
                 } else {
                     finalSsoDecision = { ...hrSettings.sso, source: 'AUTO_LOCK' };
                     await setDoc(batchDocRef, { ssoDecision: finalSsoDecision, ssoDecisionHash: currentSsoHash }, { merge: true });
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
                getDocs(attendanceYtdSnap),
                getDocs(adjustmentsYtdSnap),
                getDocs(payslipsQuery),
            ]);

            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
            const activeUsers = allUsers.filter(u => u?.hr?.payType && u.hr.payType !== 'NOPAY');

            const allHolidays = new Map(
              holidaysSnap.docs.map(d => {
                const raw = d.data().date;
                const key =
                  typeof raw === "string"
                    ? raw.trim().slice(0, 10)                      // "YYYY-MM-DD"
                    : (raw?.toDate ? format(raw.toDate(), "yyyy-MM-dd") : "");
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
                const existingSlip = existingPayslips.get(user.uid);
                
                return { ...user, periodMetrics, periodMetricsYtd, payslipStatus: existingSlip?.status ?? 'ไม่มีสลิป', snapshot: existingSlip?.snapshot ?? null, revisionNo: existingSlip?.revisionNo };
            });
            setEmployeeData(data);
        } catch (e: any) {
            setError(e);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsLoading(false);
        }
    }, [db, hrSettings, currentMonth, period, toast]);
    
    const handleSsoDecisionConfirm = async (decision: any) => {
        if (!db || !adminProfile) return;
        const monthBatchId = `${format(currentMonth, 'yyyy-MM')}`;
        const batchRef = doc(db, 'payrollBatches', monthBatchId);
        await setDoc(batchRef, {
            ssoDecision: decision,
            ssoDecisionHash: JSON.stringify(decision)
        }, { merge: true });
        setSsoDecision(decision);
        setIsSsoDecisionDialogOpen(false);
        toast({ title: 'อัปเดตการตั้งค่า SSO สำหรับเดือนนี้แล้ว', description: 'กรุณากดดึงข้อมูลอีกครั้ง' });
    };

    const handleOpenDrawer = async (user: EmployeeRowData) => {
        setEditingPayslip(user);
        const { periodMetrics, periodMetricsYtd, snapshot: existingSnapshot, hr } = user;

        if (!hr?.payType || hr.payType === 'NOPAY') return;
        if (!periodMetrics || !periodMetricsYtd) { toast({variant: 'destructive', title: 'คำนวณไม่สำเร็จ', description: 'ไม่สามารถคำนวณข้อมูลการทำงานของพนักงานได้'}); setEditingPayslip(null); return; }
        
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
        if (ssoDecision && (hr.payType === 'MONTHLY' || hr.payType === 'MONTHLY_NOSCAN') && hr.salaryMonthly) {
            const { employeePercent = 0, monthlyMinBase = 0, monthlyCap = Infinity } = ssoDecision;
            const ssoMonthly = calcSsoMonthly(hr.salaryMonthly, employeePercent, monthlyMinBase, monthlyCap);
            const { p1, p2 } = splitSsoHalf(ssoMonthly);

            let ssoAmountThisPeriod = 0;
            if (period === 1) {
                ssoAmountThisPeriod = p1;
            } else { // period === 2
                const p1BatchId = `${format(currentMonth, 'yyyy-MM')}-1`;
                const p1PayslipRef = doc(db, 'payrollBatches', p1BatchId, 'payslips', user.uid);
                const p1PayslipSnap = await getDoc(p1PayslipRef);
                const p1Deducted = p1PayslipSnap.exists() ? (p1PayslipSnap.data().snapshot?.deductions?.find((d:any) => d.name === '[AUTO] ประกันสังคม')?.amount ?? 0) : 0;
                ssoAmountThisPeriod = round2(ssoMonthly - p1Deducted);
            }
            
            initialSnapshot.deductions = initialSnapshot.deductions.filter(d => d.name !== '[AUTO] ประกันสังคม');
            if (ssoAmountThisPeriod > 0) {
                initialSnapshot.deductions.push({ name: '[AUTO] ประกันสังคม', amount: ssoAmountThisPeriod, notes: `หักครึ่งงวด (เดือนนี้ใช้เรท ${employeePercent}%)` });
            } else if (ssoAmountThisPeriod < 0) {
                 initialSnapshot.additions.push({ name: '[AUTO] คืนประกันสังคม', amount: Math.abs(ssoAmountThisPeriod), notes: `ปรับยอดจากงวดที่ 1` });
            }
        }

        const totals = calcTotals(initialSnapshot);
        setDrawerSnapshot({ ...initialSnapshot, netPay: totals.netPay });
    };

    const handleSaveDraft = async () => {
        if (!db || !adminProfile || !editingPayslip || !drawerSnapshot) return;
        setIsActing(editingPayslip.uid);
        
        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const batchRef = doc(db, 'payrollBatches', payrollBatchId);
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', editingPayslip.uid);

        try {
            await setDoc(batchRef, { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1, periodNo: period, createdAt: serverTimestamp(), createdByUid: adminProfile.uid, createdByName: adminProfile.displayName }, { merge: true });
            const totals = calcTotals(drawerSnapshot);
            const finalSnapshot = { ...drawerSnapshot, netPay: totals.netPay };

            await setDoc(payslipRef, { status: 'DRAFT', snapshot: finalSnapshot, userId: editingPayslip.uid, userName: editingPayslip.displayName, batchId: payrollBatchId, revisionNo: editingPayslip.revisionNo || 0, updatedAt: serverTimestamp() }, { merge: true });
            setEmployeeData(prev => prev.map(e => e.uid === editingPayslip.uid ? { ...e, payslipStatus: 'DRAFT', snapshot: finalSnapshot, revisionNo: editingPayslip.revisionNo || 0 } : e));
            toast({ title: `บันทึกสลิปร่างสำหรับ ${editingPayslip.displayName} สำเร็จ` });
            setEditingPayslip(null); setDrawerSnapshot(null);
        } catch (e: any) { toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message }); } finally { setIsActing(null); }
    };
    
    const handleSaveAndSend = async () => {
        if (!db || !adminProfile || !editingPayslip || !drawerSnapshot) return;
        setIsActing(editingPayslip.uid);

        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const batchRef = doc(db, 'payrollBatches', payrollBatchId);
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', editingPayslip.uid);

        try {
            await setDoc(batchRef, { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1, periodNo: period, createdAt: serverTimestamp(), createdByUid: adminProfile.uid, createdByName: adminProfile.displayName }, { merge: true });
            const totals = calcTotals(drawerSnapshot);
            const finalSnapshot = { ...drawerSnapshot, netPay: totals.netPay };
            const nextRevisionNo = (editingPayslip.revisionNo || 0) + 1;

            await setDoc(payslipRef, { status: 'SENT_TO_EMPLOYEE', snapshot: finalSnapshot, userId: editingPayslip.uid, userName: editingPayslip.displayName, batchId: payrollBatchId, revisionNo: nextRevisionNo, updatedAt: serverTimestamp(), sentAt: serverTimestamp(), lockedAt: serverTimestamp() }, { merge: true });
            setEmployeeData(prev => prev.map(e => e.uid === editingPayslip.uid ? { ...e, payslipStatus: 'SENT_TO_EMPLOYEE', snapshot: finalSnapshot, revisionNo: nextRevisionNo } : e));
            toast({ title: `ส่งสลิปให้ ${editingPayslip.displayName} แล้ว` });
            setEditingPayslip(null); setDrawerSnapshot(null);
        } catch (e: any) { toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message }); } finally { setIsActing(null); }
    };

    if (!hasPermission) return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle></CardHeader></Card>;

    const periodLabel = `งวด ${period} (${format(currentMonth, 'MMMM yyyy')})`;
    const drawerTotals = useMemo(() => calcTotals(drawerSnapshot), [drawerSnapshot]);

    return (
        <>
            <PageHeader title="สร้างสลิปเงินเดือน" description="คำนวณและสร้างสลิปเงินเดือนฉบับร่างสำหรับพนักงานแต่ละคน" />
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <CardTitle>เลือกช่วงเวลา</CardTitle>
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
                    <Button onClick={handleFetchEmployees} disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin mr-2" /> : <CalendarDays className="mr-2"/>}
                        ดึงรายชื่อพนักงานในช่วงนี้
                    </Button>
                </CardContent>
            </Card>

            {isLoading && <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}
            {error && <Card className="mt-6 bg-destructive/10"><CardHeader><CardTitle className="text-destructive">Error</CardTitle><CardDescription className="text-destructive">{error.message}</CardDescription></CardHeader></Card>}
            
            {employeeData.length > 0 && (
                <Card className="mt-6">
                    <CardHeader><CardTitle>รายชื่อพนักงาน</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>ชื่อพนักงาน</TableHead><TableHead>แผนก</TableHead><TableHead>ประเภทการจ่าย</TableHead><TableHead>วันทำงาน</TableHead><TableHead>สถานะสลิป</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {employeeData.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell>{user.displayName}</TableCell>
                                        <TableCell>{deptLabel(user.department)}</TableCell>
                                        <TableCell>{payTypeLabel(user.hr?.payType)}</TableCell>
                                        <TableCell>{user.periodMetrics?.attendanceSummary.payableUnits ?? '-'}</TableCell>
                                        <TableCell><Badge variant={getStatusBadgeVariant(user.payslipStatus)}>{newPayslipStatusLabel(user.payslipStatus) || user.payslipStatus}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" disabled={isActing !== null || user.hr?.payType === 'NOPAY'} aria-label="เมนูการจัดการ"><MoreVertical className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => void handleOpenDrawer(user)} disabled={isActing !== null || user.payslipStatus === 'PAID' || user.hr?.payType === 'NOPAY'}>
                                                        <FilePlus className="mr-2 h-4 w-4" /> สร้าง/แก้ไขสลิป
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
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
                    title="แก้ไขสลิปเงินเดือน" description={`${editingPayslip.displayName} - ${periodLabel}`}
                    copyText={formatPayslipAsText({ userName: editingPayslip.displayName, periodLabel, snapshot: drawerSnapshot, payType: editingPayslip.hr?.payType, totals: drawerTotals })}
                    copyJson={formatPayslipAsJson(drawerSnapshot)}
                    footerActions={ (editingPayslip.payslipStatus !== 'PAID' && editingPayslip.payslipStatus !== 'READY_TO_PAY') && (
                        <>
                          <Button variant="outline" onClick={() => setEditingPayslip(null)} disabled={isActing === editingPayslip.uid}>ยกเลิก</Button>
                          <Button onClick={handleSaveDraft} disabled={isActing === editingPayslip.uid}><Save className="mr-2"/>บันทึกฉบับร่าง</Button>
                          <Button onClick={handleSaveAndSend} disabled={isActing === editingPayslip.uid}>{isActing === editingPayslip.uid ? <Loader2 className="animate-spin mr-2"/> : <Send className="mr-2"/>}บันทึกแล้วส่ง</Button>
                        </>
                      )
                    }
                >
                    <PayslipSlipView userName={editingPayslip.displayName} periodLabel={periodLabel} snapshot={drawerSnapshot} mode="edit" payType={editingPayslip.hr?.payType} onChange={setDrawerSnapshot}/>
                </PayslipSlipDrawer>
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
        </>
    );
}
