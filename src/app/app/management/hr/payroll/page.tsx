"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { doc, collection, query, where, orderBy, writeBatch, serverTimestamp, updateDoc, getDocs, Timestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection, type WithId } from "@/firebase/firestore/use-collection";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, max, min, parseISO, eachDayOfInterval, isSaturday, isSunday, isAfter, isBefore, setHours, setMinutes, differenceInMinutes, startOfToday, set } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, AlertCircle, Edit, View, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { HRSettings, UserProfile, LeaveRequest, PayrollRun, Payslip, PayslipDeduction, Attendance, HRHoliday, AttendanceAdjustment, UserStatus } from "@/lib/types";
import { deptLabel, payTypeLabel } from "@/lib/ui-labels";

// This logic is complex and adapted from the accounting payroll page
// It calculates the summary of attendance for a given user in a period
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
    const daysInPeriod = eachDayOfInterval(period);
    const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
    const graceMinutes = hrSettings.graceMinutes || 0;
    const weekendMode = hrSettings.weekendPolicy?.mode || 'SAT_SUN';
    const [absentCutoffHour, absentCutoffMinute] = (hrSettings.absentCutoffTime || '09:00').split(':').map(Number);
    
    let workDays = 0;
    
    daysInPeriod.forEach(day => {
        if (isAfter(day, today)) return;
        
        const dayStr = format(day, 'yyyy-MM-dd');
        if (allHolidays.has(dayStr)) return;
        const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
        if (isWeekendDay) return;

        const onLeave = allUserLeaves.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
        if (onLeave) return;

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


// New page component
export default function HRGeneratePayslipsPage() {
    const { db } = useFirebase();
    const { toast } = useToast();
    const { profile: adminProfile } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [period, setPeriod] = useState<1 | 2>(1);
    
    const [isLoading, setIsLoading] = useState(false);
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
              ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), period1StartDay) 
              : new Date(currentMonth.getFullYear(), currentMonth.getMonth(), period2StartDay);
            const periodEndDate = period === 1 
              ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), period1EndDay) 
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
            const payrollRunId = `${format(currentMonth, 'yyyy-MM')}-${period}`;
            const payslipsQuery = query(collection(db, 'payrollRuns', payrollRunId, 'payslips'));

            const [
                usersSnap, holidaysSnap, leavesSnap, attendanceSnap, adjustmentsSnap, payslipsSnap
            ] = await Promise.all([
                getDocs(usersQuery), getDocs(holidaysQuery), getDocs(leavesQuery), getDocs(attendanceQuery), getDocs(adjustmentsQuery), getDocs(payslipsQuery)
            ]);

            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
            const activeUsers = allUsers.filter(u => u.hr?.salaryMonthly && u.hr.salaryMonthly > 0 && u.hr.payType !== 'NOPAY');

            const allHolidays = new Map(holidaysSnap.docs.map(d => [d.data().date, d.data().name]));
            const allLeaves = leavesSnap.docs.map(d => d.data() as LeaveRequest);
            const allAttendance = attendanceSnap.docs.map(d => d.data() as Attendance);
            const allAdjustments = adjustmentsSnap.docs.map(d => d.data() as AttendanceAdjustment);
            const existingPayslips = new Map(payslipsSnap.docs.map(d => [d.id, d.data() as Payslip]));

            const data = activeUsers.map(user => {
                const userLeaves = allLeaves.filter(l => l.userId === user.id);
                const userAttendance = allAttendance.filter(a => a.userId === user.id);
                const userAdjustments = allAdjustments.filter(a => a.userId === user.id);

                const workDays = calculateUserPeriodSummary(user, payPeriod, hrSettings, userLeaves, userAttendance, userAdjustments, allHolidays);

                return {
                    ...user,
                    calculatedWorkDays: workDays,
                    payslipStatus: existingPayslips.get(user.id)?.employeeStatus ?? 'ไม่มีสลิป'
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
        // This is a complex function that calculates the full payslip.
        // For this prompt, I will create a placeholder action.
        toast({ title: `กำลังสร้าง/อัปเดตสลิปสำหรับ ${user.displayName}` });
    };

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
                                    <SelectItem value="1">งวดที่ 1 (1-15)</SelectItem>
                                    <SelectItem value="2">งวดที่ 2 (16-สิ้นเดือน)</SelectItem>
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
                            <TableHeader><TableRow><TableHead>ชื่อพนักงาน</TableHead><TableHead>แผนก</TableHead><TableHead>ประเภทการจ่าย</TableHead><TableHead>วันทำงาน (ที่นับได้)</TableHead><TableHead>สถานะสลิป</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {employeeData.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell>{user.displayName}</TableCell>
                                        <TableCell>{deptLabel(user.department)}</TableCell>
                                        <TableCell>{payTypeLabel(user.hr.payType)}</TableCell>
                                        <TableCell>{user.calculatedWorkDays}</TableCell>
                                        <TableCell><Badge variant={user.payslipStatus === 'ไม่มีสลิป' ? 'outline' : 'secondary'}>{user.payslipStatus}</Badge></TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="outline" size="sm">แก้ไขเวลา</Button>
                                            <Button variant="outline" size="sm">แก้ไขใบลา</Button>
                                            <Button size="sm" onClick={() => handleCreateUpdateDraft(user)}>สร้าง/อัปเดตฉบับร่าง</Button>
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
