"use client";

import { useState, useMemo, useEffect } from "react";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, isSaturday, isSunday, subMonths, addMonths, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { safeFormat } from '@/lib/date-utils';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserProfile, Attendance, LeaveRequest, HRHoliday as HRHolidayType, HRSettings, LeaveType } from "@/lib/types";
import { DateRange } from "react-day-picker";


export default function ManagementHRAttendanceSummaryPage() {
    const { db } = useFirebase();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const dateRange: DateRange | undefined = useMemo(() => ({
        from: startOfMonth(currentMonth),
        to: endOfMonth(currentMonth),
    }), [currentMonth]);

    const usersQuery = useMemo(() => db ? query(collection(db, 'users'), where('status', '==', 'ACTIVE'), orderBy('displayName', 'asc')) : null, [db]);
    const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);

    const attendanceQuery = useMemo(() => {
        if (!db || !dateRange?.from || !dateRange?.to) return null;
        return query(collection(db, 'attendance'), 
            where('timestamp', '>=', dateRange.from), 
            where('timestamp', '<=', dateRange.to),
            orderBy('timestamp', 'asc')
        );
    }, [db, dateRange]);
    const { data: attendance, isLoading: isLoadingAttendance, error: attendanceError } = useCollection<Attendance>(attendanceQuery);

    const approvedLeavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), where('status', '==', 'APPROVED')) : null, [db]);
    const { data: approvedLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(approvedLeavesQuery);

    const holidaysQuery = useMemo(() => db ? query(collection(db, 'hrHolidays')) : null, [db]);
    const { data: holidays, isLoading: isLoadingHolidays } = useCollection<HRHolidayType>(holidaysQuery);

    const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
    const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
    
    const isLoading = isLoadingUsers || isLoadingAttendance || isLoadingLeaves || isLoadingHolidays || isLoadingSettings;

    const { days, summaryData } = useMemo(() => {
        if (isLoading || !dateRange?.from || !dateRange.to || !users || !attendance || !approvedLeaves || !holidays || !hrSettings) {
            return { days: [], summaryData: [] };
        }

        const intervalDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        const holidaysMap = new Map(holidays.map(h => [h.date, h.name]));
        const leavesMap = new Map<string, LeaveRequest[]>();
        approvedLeaves.forEach(leave => {
            if (!leavesMap.has(leave.userId)) leavesMap.set(leave.userId, []);
            leavesMap.get(leave.userId)!.push(leave);
        });
        
        const attendanceByUser = new Map<string, Attendance[]>();
        attendance.forEach(att => {
            if (!attendanceByUser.has(att.userId)) attendanceByUser.set(att.userId, []);
            attendanceByUser.get(att.userId)!.push(att);
        });

        const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
        const graceMinutes = hrSettings.graceMinutes || 0;

        const processedData = users.map(user => {
            const dailyStatuses = intervalDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                
                if (holidaysMap.has(dayStr)) return { status: 'HOLIDAY', name: holidaysMap.get(dayStr) };
                if (isSaturday(day) || isSunday(day)) return { status: 'WEEKEND' };

                const userLeaves = leavesMap.get(user.id) || [];
                const onLeave = userLeaves.find(leave => 
                    isWithinInterval(day, { start: parseISO(leave.startDate), end: parseISO(leave.endDate) })
                );
                if (onLeave) {
                    const leaveTypeMap: Record<LeaveType, string> = { SICK: "ป่วย", BUSINESS: "กิจ", VACATION: "พัก" };
                    return { status: 'LEAVE', type: leaveTypeMap[onLeave.leaveType] || "ลา" };
                }
                
                const userAttendanceToday = (attendanceByUser.get(user.id) || []).filter((att: any) => 
                    att.timestamp && format(att.timestamp.toDate(), 'yyyy-MM-dd') === dayStr
                );
                
                const clockIns = userAttendanceToday.filter((a: any) => a.type === 'IN').map((a: any) => a.timestamp.toDate()).sort((a: Date, b: Date) => a.getTime() - b.getTime());
                const clockOuts = userAttendanceToday.filter((a: any) => a.type === 'OUT').map((a: any) => a.timestamp.toDate()).sort((a: Date, b: Date) => a.getTime() - b.getTime());

                if (clockIns.length === 0) return { status: 'ABSENT' };

                const firstClockIn = clockIns[0];
                const lastClockOut = clockOuts.length > 0 ? clockOuts[clockOuts.length - 1] : undefined;
                
                let status: 'PRESENT' | 'LATE' = 'PRESENT';
                const clockInTime = firstClockIn.getHours() * 60 + firstClockIn.getMinutes();
                const workStartTime = workStartHour * 60 + workStartMinute + graceMinutes;
                if (clockInTime > workStartTime) {
                    status = 'LATE';
                }
                
                return { status, clockIn: firstClockIn, clockOut: lastClockOut };
            });
            return { user, dailyStatuses };
        });

        return { days: intervalDays, summaryData: processedData };
    }, [isLoading, dateRange, users, attendance, approvedLeaves, holidays, hrSettings]);

    useEffect(() => {
        if (attendanceError?.message?.includes('requires an index')) {
          const urlMatch = attendanceError.message.match(/https?:\/\/[^\s]+/);
          toast({
            variant: "destructive",
            title: "Database Index Required",
            description: `The attendance query needs an index. Please create it in Firebase. ${urlMatch ? `Link: ${urlMatch[0]}`: ''}`,
            duration: 20000,
          });
        }
    }, [attendanceError, toast]);
    
    const getStatusContent = (dayStatus: any) => {
        let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
        let text: React.ReactNode = '';
        let tooltipContent = '';

        switch(dayStatus.status) {
            case 'PRESENT':
                variant = 'default';
                text = 'P';
                tooltipContent = `Present. In: ${safeFormat(dayStatus.clockIn, 'HH:mm')}${dayStatus.clockOut ? `, Out: ${safeFormat(dayStatus.clockOut, 'HH:mm')}`: ''}`;
                break;
            case 'LATE':
                variant = 'destructive';
                text = 'L';
                tooltipContent = `Late. In: ${safeFormat(dayStatus.clockIn, 'HH:mm')}`;
                break;
            case 'ABSENT': variant = 'destructive'; text = 'A'; tooltipContent = 'Absent'; break;
            case 'LEAVE':
                variant = 'secondary';
                text = dayStatus.type;
                tooltipContent = `On Leave (${dayStatus.type})`;
                break;
            case 'HOLIDAY': variant = 'secondary'; text = 'H'; tooltipContent = `Holiday: ${dayStatus.name}`; break;
            case 'WEEKEND': return <div className="w-full h-8 flex items-center justify-center text-muted-foreground text-xs"></div>;
            default: return null;
        }

        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant={variant} className="w-8 h-8 flex items-center justify-center cursor-default">{text}</Badge>
                    </TooltipTrigger>
                    <TooltipContent><p>{tooltipContent}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    return (
        <>
            <PageHeader title="สรุปลงเวลา" description="สรุปการลงเวลาทำงานรายวันของพนักงานทุกคน" />
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <CardTitle>Attendance Summary</CardTitle>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                            <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="font-semibold text-lg text-center w-32">{format(currentMonth, 'MMMM yyyy')}</span>
                            <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
                    ) : attendanceError ? (
                        <div className="text-destructive text-center p-8">Error loading attendance data. A database index might be required. Check console for details.</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="sticky left-0 bg-background min-w-[150px]">Employee</TableHead>
                                    {days.map(day => <TableHead key={day.toString()} className="text-center">{format(day, 'd')}</TableHead>)}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summaryData.map(({ user, dailyStatuses }) => (
                                <TableRow key={user.id}>
                                    <TableCell className="sticky left-0 bg-background font-medium">{user.displayName}</TableCell>
                                    {dailyStatuses.map((status, index) => (
                                    <TableCell key={index} className="text-center p-1">
                                        {getStatusContent(status)}
                                    </TableCell>
                                    ))}
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
