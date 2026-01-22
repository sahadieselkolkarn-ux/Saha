"use client";

import { useState, useMemo, useEffect } from "react";
import { doc, collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval,
  isSaturday, isSunday, subMonths, addMonths, parseISO, differenceInMinutes, setHours, setMinutes
} from 'date-fns';
import { safeFormat } from '@/lib/date-utils';

import type { UserProfile, Attendance, LeaveRequest, HRHoliday as HRHolidayType, HRSettings, AttendanceAdjustment } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, ChevronLeft, ChevronRight, AlertCircle, Edit, CalendarDays, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AttendanceAdjustmentDialog } from "@/components/attendance-adjustment-dialog";

// Helper types for this component
interface AttendanceDailySummary {
  date: Date;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'NO_DATA';
  workHours?: string;
  lateMinutes?: number;
  rawIn?: Date | null;
  rawOut?: Date | null;
  adjustment?: WithId<AttendanceAdjustment>;
  leaveType?: string;
}

interface AttendanceMonthlySummary {
  userId: string;
  userName: string;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalLeave: number;
  totalLateMinutes: number;
  dailySummaries: AttendanceDailySummary[];
  reviewNeeded: boolean;
}

export default function ManagementHRAttendanceSummaryPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // State for Adjustment Dialog
  const [adjustingDayInfo, setAdjustingDayInfo] = useState<{ user: WithId<UserProfile>, day: AttendanceDailySummary } | null>(null);

  const dateRange = useMemo(() => ({ from: startOfMonth(currentMonth), to: endOfMonth(currentMonth) }), [currentMonth]);
  const year = useMemo(() => currentMonth.getFullYear(), [currentMonth]);

  // Data Fetching
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), where('status', '==', 'ACTIVE'), orderBy('displayName', 'asc')) : null, [db]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);

  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
  
  const holidaysQuery = useMemo(() => db ? query(collection(db, 'hrHolidays'), where('date', '>=', format(dateRange.from, 'yyyy-MM-dd')), where('date', '<=', format(dateRange.to, 'yyyy-MM-dd'))) : null, [dateRange, db]);
  const { data: holidays, isLoading: isLoadingHolidays } = useCollection<HRHolidayType>(holidaysQuery);

  // Fetch leaves and attendance for the entire year to simplify calculations, then filter in-memory.
  // Fetch all leaves for the year and filter by status on the client to avoid complex composite indexes.
  const leavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), where('year', '==', year)) : null, [db, year]);
  const { data: yearLeaves, isLoading: isLoadingLeaves, error: leavesError } = useCollection<LeaveRequest>(leavesQuery);

  const attendanceQuery = useMemo(() => db ? query(collection(db, 'attendance'), where('timestamp', '>=', dateRange.from), where('timestamp', '<=', dateRange.to)) : null, [db, dateRange]);
  const { data: monthAttendance, isLoading: isLoadingAttendance, error: attendanceError } = useCollection<Attendance>(attendanceQuery);
  
  const adjustmentsQuery = useMemo(() => db ? query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', format(dateRange.from, 'yyyy-MM-dd')), where('date', '<=', format(dateRange.to, 'yyyy-MM-dd'))) : null, [db, dateRange]);
  const { data: monthAdjustments, isLoading: isLoadingAdjustments, error: adjustmentsError } = useCollection<AttendanceAdjustment>(adjustmentsQuery);

  const isLoading = isLoadingUsers || isLoadingSettings || isLoadingHolidays || isLoadingLeaves || isLoadingAttendance || isLoadingAdjustments;

  // Main Calculation Logic
  const summaryData = useMemo((): AttendanceMonthlySummary[] => {
    if (isLoading || !users || !hrSettings || !holidays || !yearLeaves || !monthAttendance || !monthAdjustments) return [];

    const approvedLeaves = yearLeaves.filter(l => l.status === 'APPROVED');
    const daysInMonth = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const holidaysMap = new Map(holidays.map(h => [h.date, h.name]));
    const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
    const graceMinutes = hrSettings.graceMinutes || 0;

    return users.map(user => {
      const userLeaves = approvedLeaves.filter(l => l.userId === user.id);
      const userAttendance = monthAttendance.filter(a => a.userId === user.id);
      const userAdjustments = monthAdjustments.filter(a => a.userId === user.id);
      
      let totalPresent = 0, totalLate = 0, totalAbsent = 0, totalLeave = 0, totalLateMinutes = 0, reviewNeeded = false;

      const dailySummaries: AttendanceDailySummary[] = daysInMonth.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        let daily: AttendanceDailySummary = { date: day, status: 'NO_DATA' };

        // 1. Check for Holidays & Weekends
        if (holidaysMap.has(dayStr)) {
          daily.status = 'HOLIDAY';
          return daily;
        }
        if (isSaturday(day) || isSunday(day)) {
          daily.status = 'WEEKEND';
          return daily;
        }

        // 2. Check for Approved Leave
        const onLeave = userLeaves.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
        if (onLeave) {
          totalLeave += 1;
          daily.status = 'LEAVE';
          daily.leaveType = onLeave.leaveType;
          return daily;
        }

        // 3. Process Attendance & Adjustments
        const adjustmentForDay = userAdjustments.find(a => a.date === dayStr);
        daily.adjustment = adjustmentForDay;

        const attendanceForDay = userAttendance.filter(a => format(a.timestamp.toDate(), 'yyyy-MM-dd') === dayStr);
        const rawIns = attendanceForDay.filter(a => a.type === 'IN').map(a => a.timestamp.toDate()).sort((a,b) => a.getTime() - b.getTime());
        const rawOuts = attendanceForDay.filter(a => a.type === 'OUT').map(a => a.timestamp.toDate()).sort((a,b) => a.getTime() - b.getTime());

        let firstIn = rawIns[0] ?? null;
        let lastOut = rawOuts[rawOuts.length-1] ?? null;

        if (adjustmentForDay?.type === 'ADD_RECORD') {
          if (adjustmentForDay.adjustedIn) firstIn = adjustmentForDay.adjustedIn.toDate();
          if (adjustmentForDay.adjustedOut) lastOut = adjustmentForDay.adjustedOut.toDate();
        }
        daily.rawIn = firstIn;
        daily.rawOut = lastOut;

        if (!firstIn) {
          totalAbsent += 1;
          daily.status = 'ABSENT';
          return daily;
        }
        
        if (!lastOut) {
          reviewNeeded = true;
          daily.status = 'NO_DATA';
          return daily;
        }

        // 4. Calculate Status (Present, Late)
        const workStartTimeWithGrace = setMinutes(setHours(day, workStartHour), workStartMinute + graceMinutes);
        let lateMins = differenceInMinutes(firstIn, workStartTimeWithGrace);
        if (lateMins < 0) lateMins = 0;

        if (adjustmentForDay?.type === 'FORGIVE_LATE') lateMins = 0;

        if (lateMins > 0) {
          daily.status = 'LATE';
          daily.lateMinutes = lateMins;
          totalLate += 1;
          totalLateMinutes += lateMins;
        } else {
          daily.status = 'PRESENT';
          totalPresent += 1;
        }
        
        const workMins = differenceInMinutes(lastOut, firstIn);
        daily.workHours = `${Math.floor(workMins/60)}h ${workMins % 60}m`;
        
        return daily;
      });

      return {
        userId: user.id, userName: user.displayName,
        totalPresent, totalLate, totalAbsent, totalLeave, totalLateMinutes,
        dailySummaries, reviewNeeded
      };
    });
  }, [isLoading, users, hrSettings, holidays, yearLeaves, monthAttendance, monthAdjustments, dateRange]);


  useEffect(() => {
    const combinedError = attendanceError || leavesError || adjustmentsError;
    if (combinedError?.message?.includes('requires an index')) {
      toast({
        variant: "destructive",
        title: "Database Index Required",
        description: `A query needs a Firestore index. Check developer console for the link to create it.`,
        duration: 20000,
      });
    }
  }, [attendanceError, leavesError, adjustmentsError, toast]);

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const getStatusBadge = (status: AttendanceDailySummary['status'], leaveType?: string) => {
    switch (status) {
      case 'PRESENT': return <Badge variant="default">Present</Badge>;
      case 'LATE': return <Badge variant="destructive">Late</Badge>;
      case 'ABSENT': return <Badge variant="destructive">Absent</Badge>;
      case 'LEAVE': return <Badge variant="secondary">{leaveType || 'Leave'}</Badge>;
      case 'NO_DATA': return <Badge variant="outline">No Data</Badge>;
      default: return <span className="text-muted-foreground text-xs">{status}</span>
    }
  };

  return (
    <>
      <PageHeader title="สรุปลงเวลา" description="สรุปการลงเวลาทำงานรายวันของพนักงานทุกคน" />
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>Attendance Summary</CardTitle>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="outline" onClick={handleToday}><CalendarDays className="mr-2 h-4 w-4" />Today</Button>
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-lg text-center w-36">{format(currentMonth, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
          ) : (
            <Accordion type="multiple" className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Employee</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Leave</TableHead>
                    <TableHead>Total Late (min)</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
              {summaryData.length > 0 ? summaryData.map(summary => (
                <AccordionItem value={summary.userId} key={summary.userId}>
                  <AccordionTrigger className="hover:no-underline hover:bg-muted/50 px-4">
                    <Table className="w-full">
                      <TableBody>
                        <TableRow className="border-none hover:bg-transparent">
                          <TableCell className="w-[200px] font-medium">{summary.userName}</TableCell>
                          <TableCell>{summary.totalPresent}</TableCell>
                          <TableCell>{summary.totalLate}</TableCell>
                          <TableCell>{summary.totalAbsent}</TableCell>
                          <TableCell>{summary.totalLeave}</TableCell>
                          <TableCell>{summary.totalLateMinutes}</TableCell>
                          <TableCell>
                            {summary.reviewNeeded && <Badge variant="destructive">Review Needed</Badge>}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-4 bg-muted/30 max-h-96 overflow-y-auto">
                      <h4 className="font-semibold mb-2">Daily Details for {summary.userName}</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Clock In</TableHead>
                            <TableHead>Clock Out</TableHead>
                            <TableHead>Work Hours</TableHead>
                            <TableHead>Late (min)</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.dailySummaries.map(day => (
                            <TableRow key={day.date.toISOString()} className="bg-background">
                              <TableCell>{format(day.date, 'eee, dd MMM')}</TableCell>
                              <TableCell>{getStatusBadge(day.status, day.leaveType)}</TableCell>
                              <TableCell>{safeFormat(day.rawIn, 'HH:mm')}</TableCell>
                              <TableCell>{safeFormat(day.rawOut, 'HH:mm')}</TableCell>
                              <TableCell>{day.workHours || '-'}</TableCell>
                              <TableCell>{day.lateMinutes || '-'}</TableCell>
                              <TableCell className="text-right">
                                {day.status !== 'HOLIDAY' && day.status !== 'WEEKEND' && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="outline"
                                          size="icon"
                                          onClick={() => setAdjustingDayInfo({ user: users.find(u=>u.id===summary.userId)!, day })}
                                        >
                                          <Edit className="h-4 w-4"/>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Adjust Attendance</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )) : (
                <div className="text-center p-8 text-muted-foreground">No active employees found.</div>
              )}
            </Accordion>
          )}
        </CardContent>
      </Card>
      {adjustingDayInfo && (
          <AttendanceAdjustmentDialog 
            isOpen={!!adjustingDayInfo}
            onOpenChange={(isOpen) => !isOpen && setAdjustingDayInfo(null)}
            dayInfo={adjustingDayInfo.day}
            user={adjustingDayInfo.user}
          />
      )}
    </>
  );
}
