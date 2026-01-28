
"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { doc, collection, query, where, orderBy, getDocs, Timestamp, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval, isSaturday, isSunday, isAfter, isBefore, set, differenceInMinutes, startOfToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, CalendarDays, MoreVertical } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { HRSettings, UserProfile, LeaveRequest, PayslipNew, Attendance, HRHoliday, AttendanceAdjustment, PayslipStatusNew, PayType, PayslipSnapshot } from "@/lib/types";
import { deptLabel, payTypeLabel, newPayslipStatusLabel } from "@/lib/ui-labels";
import { WithId } from "@/firebase/firestore/use-collection";

// This calculation logic is complex and might need refinement based on business rules.
function calculateUserPeriodSummary(
    user: WithId<UserProfile>,
    period: { start: Date; end: Date },
    hrSettings: HRSettings,
    allUserLeaves: LeaveRequest[],
    allUserAttendance: Attendance[],
    allUserAdjustments: AttendanceAdjustment[],
    allHolidays: Map<string, string>
) {
    const today = startOfToday();
    if (isAfter(period.start, today)) return 0; // Don't calculate for future periods

    const daysInPeriod = eachDayOfInterval({start: period.start, end: Math.min(period.end.getTime(), today.getTime()) as any});
    
    const weekendMode = hrSettings.weekendPolicy?.mode || 'SAT_SUN';
    const [absentCutoffHour, absentCutoffMinute] = (hrSettings.absentCutoffTime || '09:00').split(':').map(Number);
    
    let workDays = 0;
    
    daysInPeriod.forEach(day => {
        if (user.hr?.startDate && isBefore(day, parseISO(user.hr.startDate))) return;
        if (user.hr?.endDate && isAfter(day, parseISO(user.hr.endDate))) return;

        const dayStr = format(day, 'yyyy-MM-dd');
        if (allHolidays.has(dayStr)) return;
        const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
        if (isWeekendDay) return;

        const onLeave = allUserLeaves.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
        if (onLeave) return; // On leave doesn't count as a work day for this purpose

        const attendanceForDay = allUserAttendance.filter(a => a.timestamp && format(a.timestamp.toDate(), 'yyyy-MM-dd') === dayStr);
        let firstIn = attendanceForDay.find(a => a.type === 'IN')?.timestamp.toDate();

        const adjustmentForDay = allUserAdjustments.find(a => a.date === dayStr);
        if (adjustmentForDay?.type === 'ADD_RECORD' && adjustmentForDay.adjustedIn) {
            firstIn = adjustmentForDay.adjustedIn.toDate();
        }
        
        if (!firstIn) return; // Absent

        const absentCutoff = set(day, { hours: absentCutoffHour, minutes: absentCutoffMinute });
        if (isAfter(firstIn, absentCutoff)) return; // Absent
        
        workDays++;
    });

    return workDays;
}

const getStatusBadgeVariant = (status?: PayslipStatusNew) => {
    switch (status) {
        case 'DRAFT': return 'secondary';
        case 'SENT_TO_EMPLOYEE': return 'default';
        case 'REVISION_REQUESTED': return 'destructive';
        case 'READY_TO_PAY': return 'outline';
        case 'PAID': return 'default'; // could be a different color
        default: return 'outline';
    }
}

export default function HRGeneratePayslipsPage() {
    const { db } = useFirebase();
    const { toast } = useToast();
    const { profile: adminProfile } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [period, setPeriod] = useState<1 | 2>(new Date().getDate() <= 15 ? 1 : 2);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isActing, setIsActing] = useState<string | null>(null); // For per-row actions
    const [error, setError] = useState<Error | null>(null);

    const [employeeData, setEmployeeData] = useState<any[]>([]);
    
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
            const startStr = format(payPeriod.start, 'yyyy-MM-dd');
            const endStr = format(payPeriod.end, 'yyyy-MM-dd');
            
            const usersQuery = query(collection(db, 'users'), where('status', '==', 'ACTIVE'));
            const holidaysQuery = query(collection(db, 'hrHolidays'), where('date', '>=', startStr), where('date', '<=', endStr));
            const leavesQuery = query(collection(db, 'hrLeaves'), where('year', '==', year), where('status', '==', 'APPROVED'));
            const attendanceQuery = query(collection(db, 'attendance'), where('timestamp', '>=', payPeriod.start), where('timestamp', '<=', payPeriod.end));
            const adjustmentsQuery = query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', startStr), where('date', '<=', endStr));
            const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
            const payslipsQuery = query(collection(db, 'payrollBatches', payrollBatchId, 'payslips'));

            const [
                usersSnap, holidaysSnap, leavesSnap, attendanceSnap, adjustmentsSnap, payslipsSnap
            ] = await Promise.all([
                getDocs(usersQuery),
                getDocs(holidaysQuery),
                getDocs(leavesQuery),
                getDocs(attendanceQuery),
                getDocs(adjustmentsQuery),
                getDocs(payslipsQuery)
            ]);

            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));

            const activeUsers = allUsers.filter(u => u?.hr?.payType && u.hr.payType !== 'NOPAY');

            const allHolidays = new Map(holidaysSnap.docs.map(d => [d.data().date, d.data().name]));
            const allLeaves = leavesSnap.docs.map(d => d.data() as LeaveRequest);
            const allAttendance = attendanceSnap.docs.map(d => d.data() as Attendance);
            const allAdjustments = adjustmentsSnap.docs.map(d => d.data() as AttendanceAdjustment);
            const existingPayslips = new Map(payslipsSnap.docs.map(d => [d.id, d.data() as PayslipNew]));

            const data = activeUsers.map(user => {
                const userLeaves = allLeaves.filter(l => l.userId === user.id);
                const userAttendance = allAttendance.filter(a => a.userId === user.id);
                const userAdjustments = allAdjustments.filter(a => a.userId === user.id);

                const workDays = calculateUserPeriodSummary(user, payPeriod, hrSettings, userLeaves, userAttendance, userAdjustments, allHolidays);

                return {
                    ...user,
                    calculatedWorkDays: workDays,
                    payslipStatus: existingPayslips.get(user.id)?.status ?? 'ไม่มีสลิป'
                };
            });

            setEmployeeData(data);

        } catch (e: any) {
            setError(e);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsLoading(false);
        }
    }, [db, hrSettings, currentMonth, period, toast]);

    const handleCreateUpdateDraft = async (user: any) => {
        if (!db || !adminProfile) return;
        setIsActing(user.id);
        
        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const batchRef = doc(db, 'payrollBatches', payrollBatchId);
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', user.id);

        try {
            const period1StartDay = hrSettings?.payroll?.period1Start || 1;
            const period2StartDay = hrSettings?.payroll?.period2Start || 16;
            
            const startDate = period === 1 
              ? set(currentMonth, { date: period1StartDay })
              : set(currentMonth, { date: period2StartDay });
            const endDate = period === 1 
              ? set(currentMonth, { date: hrSettings?.payroll?.period1End || 15 })
              : endOfMonth(currentMonth);

            await setDoc(batchRef, {
                year: currentMonth.getFullYear(),
                month: currentMonth.getMonth() + 1,
                periodNo: period,
                startDate: format(startDate, 'yyyy-MM-dd'),
                endDate: format(endDate, 'yyyy-MM-dd'),
                createdAt: serverTimestamp(),
                createdByUid: adminProfile.uid,
                createdByName: adminProfile.displayName
            }, { merge: true });

            // Placeholder snapshot. A real implementation would calculate deductions, etc.
            const snapshot: PayslipSnapshot = {
                basePay: (user.hr?.salaryMonthly ?? 0) / 2, // Simple assumption
                netPay: (user.hr?.salaryMonthly ?? 0) / 2, // Placeholder
                deductions: [],
                additions: [],
                attendanceSummary: { presentDays: user.calculatedWorkDays },
                leaveSummary: {} // Empty for now
            };

            await setDoc(payslipRef, {
                status: 'DRAFT',
                snapshot: snapshot,
                userId: user.id,
                userName: user.displayName,
                batchId: payrollBatchId,
                revisionNo: 1, // This should be incremented on subsequent updates
                updatedAt: serverTimestamp(),
            }, { merge: true });

            setEmployeeData(prev => prev.map(e => e.id === user.id ? { ...e, payslipStatus: 'DRAFT' } : e));
            toast({ title: `สร้าง/อัปเดตสลิปร่างสำหรับ ${user.displayName} สำเร็จ` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsActing(null);
        }
    };
    
    const handleSendToEmployee = async (user: any) => {
         if (!db || !adminProfile) return;
        setIsActing(user.id);
        const payrollBatchId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
        const payslipRef = doc(db, 'payrollBatches', payrollBatchId, 'payslips', user.id);

        try {
            const currentPayslip = (await getDocs(query(collection(db, 'payrollBatches', payrollBatchId, 'payslips'), where('userId', '==', user.id)))).docs[0]?.data() as PayslipNew;
            
            await updateDoc(payslipRef, {
                status: 'SENT_TO_EMPLOYEE',
                sentAt: serverTimestamp(),
                lockedAt: serverTimestamp(),
                revisionNo: (currentPayslip?.revisionNo || 0) + 1,
                updatedAt: serverTimestamp(),
            });
            setEmployeeData(prev => prev.map(e => e.id === user.id ? { ...e, payslipStatus: 'SENT_TO_EMPLOYEE' } : e));
            toast({ title: `ส่งสลิปให้ ${user.displayName} แล้ว` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsActing(null);
        }
    }


    if (!hasPermission) {
        return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle></CardHeader></Card>;
    }

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
                                        <TableCell>{payTypeLabel(user.hr.payType)}</TableCell>
                                        <TableCell>{user.calculatedWorkDays}</TableCell>
                                        <TableCell><Badge variant={getStatusBadgeVariant(user.payslipStatus)}>{newPayslipStatusLabel(user.payslipStatus) || user.payslipStatus}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" disabled={isActing !== null} aria-label="เมนูการจัดการ">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => handleCreateUpdateDraft(user)}
                                                        disabled={isActing !== null || user.payslipStatus === 'PAID'}
                                                    >
                                                        <FilePlus className="mr-2 h-4 w-4" /> สร้าง/อัปเดตร่าง
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleSendToEmployee(user)}
                                                        disabled={isActing !== null || user.payslipStatus === 'ไม่มีสลิป' || user.payslipStatus === 'PAID' || user.payslipStatus === 'SENT_TO_EMPLOYEE'}
                                                    >
                                                        <Send className="mr-2 h-4 w-4" /> ส่งให้พนักงานตรวจสอบ
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
        </>
    );
}
