
"use client";

import { useMemo, useState, useEffect } from "react";
import { doc, collection, query, where, orderBy, writeBatch, serverTimestamp, updateDoc, getDocs, Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection, type WithId } from "@/firebase/firestore/use-collection";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, max, min, parseISO, eachDayOfInterval, isSaturday, isSunday, isAfter, isBefore, setHours, setMinutes, differenceInMinutes, startOfToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, AlertCircle, Edit, View } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { HRSettings, UserProfile, LeaveRequest, PayrollRun, Payslip, PayslipDeduction, Attendance, HRHoliday, AttendanceAdjustment } from "@/lib/types";

function getOverlapDays(range1: {start: Date, end: Date}, range2: {start: Date, end: Date}) {
  const start = max([range1.start, range2.start]);
  const end = min([range1.end, range2.end]);

  if (start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
}

const PayslipStatusBadge = ({ status }: { status: Payslip['employeeStatus'] }) => {
    switch (status) {
        case 'PENDING_REVIEW':
            return <Badge variant="secondary">Pending Review</Badge>;
        case 'ACCEPTED':
            return <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">Accepted</Badge>;
        case 'REJECTED':
            return <Badge variant="destructive">Needs Fix</Badge>;
        default:
            return null;
    }
};

// Main Payroll Component
export default function ManagementAccountingPayrollPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [period, setPeriod] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for one-time fetches
  const [manualLoading, setManualLoading] = useState(true);
  const [manualError, setManualError] = useState<Error | null>(null);
  const [allUsers, setAllUsers] = useState<WithId<UserProfile>[] | null>(null);
  const [allYearLeaves, setAllYearLeaves] = useState<LeaveRequest[] | null>(null);
  const [allHolidays, setAllHolidays] = useState<WithId<HRHoliday>[] | null>(null);
  const [monthAttendance, setMonthAttendance] = useState<WithId<Attendance>[] | null>(null);
  const [monthAdjustments, setMonthAdjustments] = useState<WithId<AttendanceAdjustment>[] | null>(null);
  
  // State for UI
  const [viewingPayslip, setViewingPayslip] = useState<any | null>(null);
  const [editingPayslipId, setEditingPayslipId] = useState<string | null>(null);
  const [currentHrNote, setCurrentHrNote] = useState("");

  const hasPermission = useMemo(() => adminProfile?.role === 'ADMIN' || adminProfile?.department === 'MANAGEMENT', [adminProfile]);

  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);

  useEffect(() => {
    if (!db) return;

    const fetchPrerequisites = async () => {
      setManualLoading(true);
      setManualError(null);
      try {
        const dateRange = { from: startOfMonth(currentMonthDate), to: endOfMonth(currentMonthDate) };
        const year = currentMonthDate.getFullYear();
        const startStr = format(dateRange.from, 'yyyy-MM-dd');
        const nextMonthDate = addMonths(currentMonthDate, 1);
        const nextMonthStart = startOfMonth(nextMonthDate);
        const nextStr = format(nextMonthStart, 'yyyy-MM-dd');
        
        const usersQuery = query(collection(db, 'users'), orderBy('displayName', 'asc'));
        const leavesQuery = query(collection(db, 'hrLeaves'), where('year', '==', year));
        const holidaysQuery = query(collection(db, 'hrHolidays'), where('date', '>=', startStr), where('date', '<', nextStr), orderBy('date', 'asc'));
        const attendanceQuery = query(collection(db, 'attendance'), where('timestamp', '>=', dateRange.from), where('timestamp', '<', nextMonthStart), orderBy('timestamp', 'asc'));
        const adjustmentsQuery = query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', startStr), where('date', '<', nextStr), orderBy('date', 'asc'));


        const [usersSnapshot, leavesSnapshot, holidaysSnapshot, attendanceSnapshot, adjustmentsSnapshot] = await Promise.all([
            getDocs(usersQuery),
            getDocs(leavesQuery),
            getDocs(holidaysQuery),
            getDocs(attendanceQuery),
            getDocs(adjustmentsSnapshot),
        ]);

        const usersData = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
        setAllUsers(usersData);
        
        const leavesData = leavesSnapshot.docs.map(d => d.data() as LeaveRequest);
        setAllYearLeaves(leavesData);

        const holidaysData = holidaysSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<HRHoliday>));
        setAllHolidays(holidaysData);

        const attendanceData = attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Attendance>));
        setMonthAttendance(attendanceData);
        
        const adjustmentsData = adjustmentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AttendanceAdjustment>));
        setMonthAdjustments(adjustmentsData);

      } catch (e: any) {
        console.error("Error fetching payroll prerequisite data:", e);
        const errorMessage = "ไม่มีสิทธิ์เข้าถึงข้อมูล หรือการดึงข้อมูลถูกปฏิเสธ";
        setManualError(new Error(errorMessage));
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: errorMessage });
      } finally {
        setManualLoading(false);
      }
    };
    
    fetchPrerequisites();
  }, [db, currentMonthDate, toast]);

  const users = useMemo(() => {
    if (!allUsers) return null;
    return allUsers.filter(u => u.status === 'ACTIVE' && u.hr?.salaryMonthly && u.hr.salaryMonthly > 0);
  }, [allUsers]);

  const payrollRunId = useMemo(() => `${format(currentMonthDate, 'yyyy-MM')}-${period}`, [currentMonthDate, period]);
  const payrollRunRef = useMemo(() => db ? doc(db, 'payrollRuns', payrollRunId) : null, [db, payrollRunId]);
  const { data: payrollRun, isLoading: isLoadingRun } = useDoc<PayrollRun>(payrollRunRef);

  const payslipsQuery = useMemo(() => db && payrollRun ? query(collection(db, 'payrollRuns', payrollRunId, 'payslips')) : null, [db, payrollRun, payrollRunId]);
  const { data: payslips, isLoading: isLoadingPayslips } = useCollection<WithId<Payslip>>(payslipsQuery);

  const isLoading = isLoadingSettings || manualLoading || isLoadingRun || isLoadingPayslips;

  const calculatedPayrollData = useMemo(() => {
    if (!hrSettings || !users || !allYearLeaves || !allHolidays || !monthAttendance || !monthAdjustments) return [];

    const today = startOfToday();
    const approvedLeaves = allYearLeaves.filter(l => l.status === 'APPROVED');
    const holidaysMap = new Map(allHolidays.map(h => [h.date, h.name]));
    const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
    const graceMinutes = hrSettings.graceMinutes || 0;
    const weekendMode = hrSettings.weekendPolicy?.mode || 'SAT_SUN';
    
    const period1StartDay = hrSettings.payroll?.period1Start || 1;
    const period1EndDay = hrSettings.payroll?.period1End || 15;
    const period2StartDay = hrSettings.payroll?.period2Start || 16;
    
    const periodStartDate = period === 1 
      ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), period1StartDay) 
      : new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), period2StartDay);
    const periodEndDate = period === 1 
      ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), period1EndDay) 
      : endOfMonth(currentMonthDate);

    const payPeriod = { start: periodStartDate, end: periodEndDate };
    const daysInPeriod = eachDayOfInterval(payPeriod);

    return users.map(user => {
      const salary = user.hr?.salaryMonthly || 0;
      const baseSalaryForPeriod = salary / 2;
      const deductions: PayslipDeduction[] = [];
      
      const userLeaves = approvedLeaves.filter(l => l.userId === user.id);
      const userAttendance = monthAttendance.filter(a => a.userId === user.id);
      const userAdjustments = monthAdjustments.filter(a => a.userId === user.id);
      
      let totalPresent = 0, totalLate = 0, totalAbsent = 0, totalLeaveInPeriod = 0, totalLateMinutes = 0;
      
      daysInPeriod.forEach(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        
        if (isAfter(day, today)) return;
        if (holidaysMap.has(dayStr)) return;
        const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
        if (isWeekendDay) return;

        const onLeave = userLeaves.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
        if (onLeave) {
          totalLeaveInPeriod += 1;
          return;
        }

        const adjustmentForDay = userAdjustments.find(a => a.date === dayStr);

        const attendanceForDay = userAttendance.filter(a => a.timestamp && format(a.timestamp.toDate(), 'yyyy-MM-dd') === dayStr);
        let firstIn = attendanceForDay.filter(a=>a.type === 'IN').sort((a,b)=>a.timestamp.toMillis() - b.timestamp.toMillis())[0]?.timestamp.toDate();

        if (adjustmentForDay?.type === 'ADD_RECORD' && adjustmentForDay.adjustedIn) {
            firstIn = adjustmentForDay.adjustedIn.toDate();
        }

        if (!firstIn) {
            totalAbsent += 1;
            return;
        }
        
        const workStartTimeWithGrace = setMinutes(setHours(day, workStartHour), workStartMinute + graceMinutes);
        let lateMins = differenceInMinutes(firstIn, workStartTimeWithGrace);
        if (lateMins < 0) lateMins = 0;
        if (adjustmentForDay?.type === 'FORGIVE_LATE') lateMins = 0;

        if (lateMins > 0) {
            totalLate += 1;
            totalLateMinutes += lateMins;
        } else {
            totalPresent += 1;
        }
      });
      
      // Leave Deduction
      const overLimitLeaves = userLeaves.filter(l => l.overLimit === true);
      overLimitLeaves.forEach(leave => {
          const leaveDateRange = { start: parseISO(leave.startDate), end: parseISO(leave.endDate) };
          const overlappingDays = getOverlapDays(payPeriod, leaveDateRange);
          if (overlappingDays > 0) {
            const policy = hrSettings.leavePolicy?.leaveTypes?.[leave.leaveType];
            if (policy?.overLimitHandling?.mode === 'DEDUCT_SALARY') {
              const deductionBaseDays = policy.salaryDeductionBaseDays || 26;
              const dailyRate = salary / deductionBaseDays;
              const deductionAmount = overlappingDays * dailyRate;
              deductions.push({ name: `Deduction: ${leave.leaveType} Leave`, amount: deductionAmount, notes: `${overlappingDays} over-limit day(s)` });
            }
          }
      });

      // Absent Deduction
      if (totalAbsent > 0) {
        const sickLeavePolicy = hrSettings.leavePolicy?.leaveTypes?.SICK;
        const deductionBaseDays = sickLeavePolicy?.overLimitHandling?.salaryDeductionBaseDays || 26;
        const dailyRate = salary / deductionBaseDays;
        deductions.push({ name: 'Deduction: Absent', amount: dailyRate * totalAbsent, notes: `${totalAbsent} absent day(s)` });
      }
      
      // SSO Deduction
      const ssoPolicy = hrSettings.sso;
      if (ssoPolicy?.employeePercent && ssoPolicy.monthlyCap) {
          const fullMonthSSO = Math.min((salary * (ssoPolicy.employeePercent / 100)), ssoPolicy.monthlyCap);
          const ssoEmployeeDeduction = fullMonthSSO / 2;
          deductions.push({ name: 'Social Security (SSO)', amount: ssoEmployeeDeduction, notes: `${ssoPolicy.employeePercent}% of salary, capped & split.` });
      }
      
      // Withholding Tax
      const whPolicy = hrSettings.withholding;
      if (whPolicy?.enabled && whPolicy.defaultPercent) {
          const whDeduction = (baseSalaryForPeriod * (whPolicy.defaultPercent / 100));
          deductions.push({ name: 'Withholding Tax', amount: whDeduction, notes: `Standard ${whPolicy.defaultPercent}% of base pay for period.` });
      }
      
      const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
      const netSalary = baseSalaryForPeriod - totalDeductions;
      
      return {
        userId: user.id,
        userName: user.displayName,
        baseSalary: baseSalaryForPeriod,
        deductions,
        netSalary,
        payrollRunId,
        totalPresent,
        totalLate,
        totalAbsent,
        totalLeave: totalLeaveInPeriod,
        totalLateMinutes,
      };
    });
  }, [hrSettings, users, allYearLeaves, allHolidays, monthAttendance, monthAdjustments, currentMonthDate, period]);


  const handleCreateDraft = async () => {
    if (!db || calculatedPayrollData.length === 0 || !adminProfile) return;
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);

        const runRef = doc(db, 'payrollRuns', payrollRunId);
        batch.set(runRef, {
            id: payrollRunId,
            year: currentMonthDate.getFullYear(),
            month: currentMonthDate.getMonth() + 1,
            period,
            status: 'DRAFT_HR',
            createdAt: serverTimestamp(),
        });
        
        calculatedPayrollData.forEach(payslipData => {
            const { totalPresent, totalLate, totalAbsent, totalLeave, totalLateMinutes, ...slipDataToSave } = payslipData;
            const payslipRef = doc(db, 'payrollRuns', payrollRunId, 'payslips', slipDataToSave.userId);
            batch.set(payslipRef, { 
                id: payslipRef.id, 
                ...slipDataToSave,
                employeeStatus: "PENDING_REVIEW",
                hrNote: null,
            });
        });

        await batch.commit();
        toast({ title: 'Draft Created', description: 'Payroll draft has been saved.' });
    } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error Creating Draft', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleSendToEmployees = async () => {
    if (!db || !payrollRun || !payslipsQuery) return;
     setIsSubmitting(true);
     try {
        const batch = writeBatch(db);

        const runRef = doc(db, 'payrollRuns', payrollRun.id);
        batch.update(runRef, {
            status: 'SENT_TO_EMPLOYEE'
        });

        const payslipsSnapshot = await getDocs(payslipsQuery);
        payslipsSnapshot.forEach(payslipDoc => {
            batch.update(payslipDoc.ref, {
                sentToEmployeeAt: serverTimestamp()
            });
        });

        await batch.commit();
        
        toast({ title: 'Sent to Employees', description: 'Payslips have been sent for employee review.' });
     } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
     } finally {
        setIsSubmitting(false);
     }
  }

  const handleSaveHrNote = async (payslipId: string) => {
    if (!db || !payrollRun) return;
    const payslipRef = doc(db, 'payrollRuns', payrollRun.id, 'payslips', payslipId);
    try {
      await updateDoc(payslipRef, {
        hrNote: currentHrNote,
      });
      toast({ title: "Note saved successfully." });
    } catch(e: any) {
      toast({ variant: 'destructive', title: 'Error saving note', description: e.message });
    } finally {
      setEditingPayslipId(null);
    }
  };

  const handlePrevMonth = () => setCurrentMonthDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonthDate(prev => addMonths(prev, 1));
  
  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'DRAFT_HR': return <Badge variant="secondary">Draft</Badge>;
        case 'SENT_TO_EMPLOYEE': return <Badge>Sent to Employees</Badge>;
        case 'FINAL': return <Badge variant="default">Final</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (!adminProfile) {
      return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin h-8 w-8" />
        </div>
      )
  }

  if (!hasPermission) {
    return (
        <>
            <PageHeader title="เงินเดือน" description="คำนวณและจัดการการจ่ายเงินเดือนพนักงาน" />
            <Card className="text-center py-12">
                <CardHeader>
                    <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                    <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น</CardDescription>
                </CardHeader>
            </Card>
        </>
    );
  }
  
  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
    }
    if (manualError) {
      return (
        <div className="text-destructive text-center p-8 bg-destructive/10 rounded-lg">
            <AlertCircle className="mx-auto h-8 w-8 mb-2" />
            <h3 className="font-semibold">เกิดข้อผิดพลาดในการโหลดข้อมูล</h3>
            <p className="text-sm">{manualError.message}</p>
        </div>
      );
    }
    if (!isLoading && !hrSettings) {
        return (
            <div className="text-center p-8">
                <AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />
                <h3 className="font-semibold">ไม่พบการตั้งค่า HR</h3>
                <p className="text-muted-foreground text-sm">กรุณาตั้งค่า HR ก่อนการคำนวณเงินเดือน</p>
                <Button asChild variant="link" className="mt-2">
                    <Link href="/app/management/hr/settings">ไปที่หน้าตั้งค่า HR</Link>
                </Button>
            </div>
        )
    }

    const data = payrollRun ? payslips : calculatedPayrollData;
    
     if (!isLoading && data.length === 0) {
        return (
            <div className="text-center text-muted-foreground p-8">
                ยังไม่มีพนักงานที่แอคทีฟและมีการตั้งเงินเดือนในงวดนี้
            </div>
        );
     }

     return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead>เงินเดือนสุทธิ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map(p => (
                    <TableRow key={p.userId}>
                        <TableCell className="font-medium">{p.userName}</TableCell>
                        <TableCell className="font-mono">{p.netSalary.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</TableCell>
                        <TableCell>
                            {payrollRun && payrollRun.status !== 'DRAFT_HR' && 'employeeStatus' in p && (
                                <PayslipStatusBadge status={p.employeeStatus} />
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setViewingPayslip(p)}>
                                <View className="mr-2 h-4 w-4"/>
                                ดูสลิป
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
     );
  }

  return (
    <>
      <PageHeader title="เงินเดือน" description="คำนวณและจัดการการจ่ายเงินเดือนพนักงาน" />
      
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>จัดการเงินเดือน</CardTitle>
              <CardDescription>เลือกงวดที่ต้องการคำนวณหรือดูข้อมูล</CardDescription>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-lg text-center w-32">{format(currentMonthDate, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
              <Select value={period.toString()} onValueChange={(v) => setPeriod(Number(v) as 1 | 2)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="1">งวดที่ 1 (1-15)</SelectItem>
                      <SelectItem value="2">งวดที่ 2 (16-สิ้นเดือน)</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>
           {payrollRun && (
            <div className="pt-4 flex items-center gap-2">
                <span className="text-sm font-semibold">สถานะ:</span>
                {getStatusBadge(payrollRun.status)}
            </div>
          )}
        </CardHeader>
        <CardContent>
            {renderContent()}
        </CardContent>
        {!isLoading && !manualError && hrSettings && (
             <CardFooter>
                {!payrollRun && (
                    <Button onClick={handleCreateDraft} disabled={isSubmitting || (calculatedPayrollData && calculatedPayrollData.length === 0)}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FilePlus className="mr-2 h-4 w-4"/>}
                        สร้างฉบับร่าง
                    </Button>
                )}
                 {payrollRun && payrollRun.status === 'DRAFT_HR' && (
                    <Button onClick={handleSendToEmployees} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                        ส่งให้พนักงานตรวจสอบ
                    </Button>
                )}
            </CardFooter>
        )}
      </Card>
      
      <Dialog open={!!viewingPayslip} onOpenChange={(open) => !open && setViewingPayslip(null)}>
        <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle>สลิปเงินเดือน (ฉบับร่าง)</DialogTitle>
             <DialogDescription>
                {viewingPayslip?.userName} - {format(currentMonthDate, 'MMMM yyyy')} Period {period}
             </DialogDescription>
           </DialogHeader>
           {viewingPayslip && (
            <>
                <div className="mb-2 text-center grid grid-cols-5 gap-1 text-xs">
                    <div className="bg-green-100 p-2 rounded-lg"><p className="font-bold text-lg text-green-700">{viewingPayslip.totalPresent}</p><p className="text-green-600">มาทำงาน</p></div>
                    <div className="bg-yellow-100 p-2 rounded-lg"><p className="font-bold text-lg text-yellow-700">{viewingPayslip.totalLate}</p><p className="text-yellow-600">สาย</p></div>
                    <div className="bg-red-100 p-2 rounded-lg"><p className="font-bold text-lg text-red-700">{viewingPayslip.totalAbsent}</p><p className="text-red-600">ขาด</p></div>
                    <div className="bg-blue-100 p-2 rounded-lg"><p className="font-bold text-lg text-blue-700">{viewingPayslip.totalLeave}</p><p className="text-blue-600">ลา</p></div>
                    <div className="bg-orange-100 p-2 rounded-lg"><p className="font-bold text-lg text-orange-700">{viewingPayslip.totalLateMinutes}</p><p className="text-orange-600">สาย (นาที)</p></div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>รายการ</TableHead>
                            <TableHead className="text-right">จำนวนเงิน (บาท)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell className="font-medium">เงินเดือน (สำหรับงวด)</TableCell>
                            <TableCell className="text-right">{viewingPayslip.baseSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                        {viewingPayslip.deductions.map((ded: any, i: number) => (
                            <TableRow key={i}>
                            <TableCell>
                                <p className="font-medium text-destructive">(-) {ded.name}</p>
                                {ded.notes && <p className="text-xs text-muted-foreground">{ded.notes}</p>}
                            </TableCell>
                            <TableCell className="text-right text-destructive">- {ded.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="bg-background font-bold text-base">
                            <TableCell>เงินเดือนสุทธิ</TableCell>
                            <TableCell className="text-right">{viewingPayslip.netSalary.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                {payrollRun && payrollRun.status === 'DRAFT_HR' && 'hrNote' in viewingPayslip && (
                    <div className="mt-4 pt-4 border-t">
                    <h5 className="font-semibold text-sm mb-2">หมายเหตุจาก HR</h5>
                    {editingPayslipId === viewingPayslip.userId ? (
                        <div className="space-y-2">
                        <Textarea
                            defaultValue={viewingPayslip.hrNote || ""}
                            onChange={(e) => setCurrentHrNote(e.target.value)}
                            placeholder="เพิ่มการปรับปรุงหรือหมายเหตุ..."
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveHrNote(viewingPayslip.userId)}>บันทึก</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPayslipId(null)}>ยกเลิก</Button>
                        </div>
                        </div>
                    ) : (
                        <div className="space-y-2 group">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md p-2 bg-muted min-h-10">
                            {viewingPayslip.hrNote || "ไม่มีหมายเหตุ"}
                        </p>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                            setEditingPayslipId(viewingPayslip.userId);
                            setCurrentHrNote(viewingPayslip.hrNote || "");
                            }}
                        >
                            <Edit className="mr-2 h-3 w-3"/>
                            แก้ไขหมายเหตุ
                        </Button>
                        </div>
                    )}
                    </div>
                )}
            </>
           )}
           <DialogFooter>
             <Button variant="outline" onClick={() => setViewingPayslip(null)}>ปิด</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
