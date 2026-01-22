"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { doc, collection, query, where, orderBy, getDocs, getDoc, Timestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval,
  isSaturday, isSunday, subMonths, addMonths, parseISO, differenceInMinutes, setHours, setMinutes
} from 'date-fns';
import { safeFormat } from '@/lib/date-utils';

import type { UserProfile, Attendance, LeaveRequest, HRHoliday as HRHolidayType, HRSettings, AttendanceAdjustment } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, ChevronLeft, ChevronRight, AlertCircle, Edit, CalendarDays, ExternalLink, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AttendanceAdjustmentDialog } from "@/components/attendance-adjustment-dialog";
import { Input } from "@/components/ui/input";

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

type UserForSummary = Pick<WithId<UserProfile>, "id" | "displayName" | "status">;

export default function ManagementHRAttendanceSummaryPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  
  // Data and loading states
  const [summaryData, setSummaryData] = useState<AttendanceMonthlySummary[]>([]);
  const [allUsers, setAllUsers] = useState<WithId<UserProfile>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);

  // State for Adjustment Dialog
  const [adjustingDayInfo, setAdjustingDayInfo] = useState<{ user: WithId<UserProfile>, day: AttendanceDailySummary } | null>(null);

  const calculateSummary = useCallback((
    users: UserForSummary[],
    hrSettings: HRSettings,
    holidays: HRHolidayType[],
    yearLeaves: LeaveRequest[],
    monthAttendance: Attendance[],
    monthAdjustments: WithId<AttendanceAdjustment>[],
    dateRange: { from: Date, to: Date }
  ): AttendanceMonthlySummary[] => {
      
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

        if (holidaysMap.has(dayStr)) {
          daily.status = 'HOLIDAY';
          return daily;
        }
        if (isSaturday(day) || isSunday(day)) {
          daily.status = 'WEEKEND';
          return daily;
        }

        const onLeave = userLeaves.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
        if (onLeave) {
          totalLeave += 1;
          daily.status = 'LEAVE';
          daily.leaveType = onLeave.leaveType;
          return daily;
        }

        const adjustmentForDay = userAdjustments.find(a => a.date === dayStr);
        daily.adjustment = adjustmentForDay;

        const attendanceForDay = userAttendance.filter(a => {
            if (!a.timestamp || !(a.timestamp instanceof Timestamp)) return false;
            return format(a.timestamp.toDate(), 'yyyy-MM-dd') === dayStr;
        });
        
        const rawIns = attendanceForDay.filter(a => a.type === 'IN' && a.timestamp && (a.timestamp instanceof Timestamp)).map(a => a.timestamp.toDate()).sort((a,b) => a.getTime() - b.getTime());
        const rawOuts = attendanceForDay.filter(a => a.type === 'OUT' && a.timestamp && (a.timestamp instanceof Timestamp)).map(a => a.timestamp.toDate()).sort((a,b) => a.getTime() - b.getTime());

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
  }, []);

  useEffect(() => {
    const fetchData = async () => {
        if (!db) return;

        setIsLoading(true);
        setError(null);
        setIndexCreationUrl(null);

        try {
            const dateRange = { from: startOfMonth(currentMonth), to: endOfMonth(currentMonth) };
            const year = currentMonth.getFullYear();
            const startStr = format(dateRange.from, 'yyyy-MM-dd');
            
            const nextMonthDate = addMonths(currentMonth, 1);
            const nextMonthStart = startOfMonth(nextMonthDate);
            const nextStr = format(nextMonthStart, 'yyyy-MM-dd');
            
            const usersQuery = query(collection(db, 'users'), orderBy('displayName','asc'));
            const settingsDocRef = doc(db, 'settings', 'hr');
            const holidaysQuery = query(collection(db, 'hrHolidays'), where('date', '>=', startStr), where('date', '<', nextStr), orderBy('date', 'asc'));
            const leavesQuery = query(collection(db, 'hrLeaves'), where('year', '==', year));
            const attendanceQuery = query(collection(db, 'attendance'), where('timestamp', '>=', dateRange.from), where('timestamp', '<', nextMonthStart), orderBy('timestamp', 'asc'));
            const adjustmentsQuery = query(collection(db, 'hrAttendanceAdjustments'), where('date', '>=', startStr), where('date', '<', nextStr), orderBy('date', 'asc'));

            const [
                usersSnapshot,
                settingsDocSnap,
                holidaysSnapshot,
                leavesSnapshot,
                attendanceSnapshot,
                adjustmentsSnapshot
            ] = await Promise.all([
                getDocs(usersQuery).catch(e => { console.warn("Could not fetch users:", e); return null; }),
                getDoc(settingsDocRef),
                getDocs(holidaysQuery),
                getDocs(leavesSnapshot),
                getDocs(attendanceQuery),
                getDocs(adjustmentsQuery),
            ]);

            const monthAttendanceData: WithId<Attendance>[] = attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Attendance>));
            const yearLeavesData: WithId<LeaveRequest>[] = leavesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<LeaveRequest>));

            const userMap = new Map<string, UserForSummary>();

            if (usersSnapshot && !usersSnapshot.empty) {
                const allUsersData = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
                setAllUsers(allUsersData);
                allUsersData.filter(u => u.status === 'ACTIVE').forEach(u => userMap.set(u.id, u));
            }

            monthAttendanceData.forEach(att => {
                if (att.userId && att.userName && !userMap.has(att.userId)) {
                    userMap.set(att.userId, { id: att.userId, displayName: att.userName, status: 'ACTIVE' });
                }
            });
            yearLeavesData.filter(l => l.status === 'APPROVED').forEach(leave => {
                if (leave.userId && leave.userName && !userMap.has(leave.userId)) {
                    userMap.set(leave.userId, { id: leave.userId, displayName: leave.userName, status: 'ACTIVE' });
                }
            });
            const usersToProcess = Array.from(userMap.values()).sort((a,b) => a.displayName.localeCompare(b.displayName));
            
            const hrSettingsData: HRSettings | undefined = settingsDocSnap.exists() ? settingsDocSnap.data() as HRSettings : undefined;
            if (!hrSettingsData) throw new Error("HR Settings not found. Please configure them in the HR settings page.");

            const holidaysData: WithId<HRHolidayType>[] = holidaysSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<HRHolidayType>));
            const monthAdjustmentsData: WithId<AttendanceAdjustment>[] = adjustmentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AttendanceAdjustment>));
            
            const calculatedData = calculateSummary(usersToProcess, hrSettingsData, holidaysData, yearLeavesData, monthAttendanceData, monthAdjustmentsData, dateRange);
            setSummaryData(calculatedData);

        } catch (err: any) {
            console.error("Error fetching attendance summary data:", err);
            if (err.message?.includes('requires an index')) {
                const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
                if (urlMatch) setIndexCreationUrl(urlMatch[0]);
            }
            setError(err);
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
  }, [db, currentMonth, toast, calculateSummary]);
  
  const filteredSummaryData = useMemo(() => {
    if (!searchQuery) return summaryData;
    return summaryData.filter(s => s.userName.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [summaryData, searchQuery]);

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

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
    }

    if (indexCreationUrl) {
      return (
        <div className="text-center p-8">
            <div className="flex flex-col items-center gap-4 bg-muted/50 p-6 rounded-lg max-w-lg mx-auto">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h3 className="font-semibold text-lg text-foreground">ต้องสร้างดัชนี (Index) ก่อน</h3>
              <p className="text-muted-foreground text-sm">
                ฐานข้อมูลต้องการดัชนีเพื่อกรองและเรียงข้อมูล กรุณาตรวจสอบ Console เพื่อดูลิงก์สำหรับสร้าง Index ใน Firebase Console (อาจใช้เวลา 2-3 นาที) แล้วลองรีเฟรชหน้านี้
              </p>
               <Button asChild className="mt-2">
                <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  เปิดหน้าสร้าง Index
                </a>
              </Button>
            </div>
        </div>
      );
    }
    
    if (error) {
      return (
         <div className="text-center p-8 text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <h3 className="font-semibold text-lg">Error Loading Data</h3>
            <p className="text-sm">{error.message}</p>
         </div>
      );
    }

    if (filteredSummaryData.length === 0) {
      return <div className="text-center p-8 text-muted-foreground">{searchQuery ? "No employees match your search." : "ยังไม่มีข้อมูลในเดือนนี้"}</div>;
    }

    return (
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
        {filteredSummaryData.map(summary => (
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
                      <TableHead>IN</TableHead>
                      <TableHead>OUT</TableHead>
                      <TableHead>Work Hours</TableHead>
                      <TableHead>Late (min)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.dailySummaries.map(day => (
                      <TableRow key={day.date.toISOString()} className="bg-background">
                        <TableCell>{safeFormat(day.date, 'dd/MM')}</TableCell>
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
                                    onClick={() => {
                                        const userForDialog = allUsers.find(u=>u.id===summary.userId);
                                        if (userForDialog) {
                                            setAdjustingDayInfo({ user: userForDialog, day })
                                        } else {
                                            toast({variant: 'destructive', title: 'Could not open dialog', description: 'User data not fully loaded.'});
                                        }
                                    }}
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
        ))}
      </Accordion>
    );
  }

  return (
    <>
      <PageHeader title="สรุปลงเวลา" description="สรุปการลงเวลาทำงานรายวันของพนักงานทุกคน" />
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="w-full sm:w-auto">
              <CardTitle>Attendance Summary</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search employee..."
                  className="pl-8 w-full sm:w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="outline" onClick={handleToday}><CalendarDays className="mr-2 h-4 w-4" />Today</Button>
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-lg text-center w-36">{format(currentMonth, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {renderContent()}
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
