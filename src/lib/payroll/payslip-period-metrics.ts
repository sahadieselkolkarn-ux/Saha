
import {
  format,
  eachDayOfInterval,
  isWithinInterval,
  isSaturday,
  isSunday,
  isAfter,
  isBefore,
  differenceInMinutes,
  set,
  startOfDay,
  endOfDay,
  parseISO,
} from 'date-fns';
import type {
  UserProfile,
  PayType,
  HRSettings,
  LeaveRequest,
  Attendance,
  AttendanceAdjustment,
  PayslipSnapshot,
  PayslipDeduction,
  LeaveType as TLeaveType
} from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';

export type PeriodMetrics = {
  attendanceSummary: {
    presentDays: number;
    lateDays: number;
    lateMinutes: number;
    absentUnits: number;
    leaveDays: number;
  };
  leaveSummary: {
    sickDays: number;
    businessDays: number;
    vacationDays: number;
    overLimitDays: number;
  };
  calcNotes: string;
  autoDeductions: PayslipDeduction[];
};

export function computePeriodMetrics(params: {
  user: WithId<UserProfile>;
  payType: PayType;
  period: { start: Date; end: Date };
  hrSettings: HRSettings;
  holidays: Map<string, string>; // yyyy-mm-dd -> name
  userLeavesApprovedYear: LeaveRequest[]; // year approved (already fetched)
  userAttendance: Attendance[]; // period range
  userAdjustments: AttendanceAdjustment[]; // period range
  today: Date;
}): PeriodMetrics {
  const {
    user,
    payType,
    period,
    hrSettings,
    holidays,
    userLeavesApprovedYear,
    userAttendance,
    userAdjustments,
    today,
  } = params;

  let attendanceSummary = { presentDays: 0, lateDays: 0, lateMinutes: 0, absentUnits: 0, leaveDays: 0 };
  let leaveSummary = { sickDays: 0, businessDays: 0, vacationDays: 0, overLimitDays: 0 };
  let calcNotes = '';
  let autoDeductions: PayslipDeduction[] = [];
  
  const periodDays = eachDayOfInterval({ start: period.start, end: Math.min(period.end.getTime(), today.getTime()) as any });
  const weekendMode = hrSettings.weekendPolicy?.mode || 'SAT_SUN';
  const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
  const graceMinutes = hrSettings.graceMinutes || 0;
  const [absentCutoffHour, absentCutoffMinute] = (hrSettings.absentCutoffTime || '09:00').split(':').map(Number);
  const [afternoonCutoffHour, afternoonCutoffMinute] = (hrSettings.afternoonCutoffTime || '12:00').split(':').map(Number);

  const userStartDate = user.hr?.startDate ? parseISO(user.hr.startDate) : null;
  const userEndDate = user.hr?.endDate ? parseISO(user.hr.endDate) : null;

  let scheduledWorkDays = 0;

  // 1. Determine scheduled working days and leave days
  periodDays.forEach(day => {
    if (userStartDate && isBefore(day, userStartDate)) return;
    if (userEndDate && isAfter(day, userEndDate)) return;

    const dayStr = format(day, 'yyyy-MM-dd');
    if (holidays.has(dayStr)) return;

    const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
    if (isWeekendDay) return;

    scheduledWorkDays++;

    const onLeave = userLeavesApprovedYear.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
    if (onLeave) {
      attendanceSummary.leaveDays++;
      if (onLeave.leaveType === 'SICK') leaveSummary.sickDays++;
      if (onLeave.leaveType === 'BUSINESS') leaveSummary.businessDays++;
      if (onLeave.leaveType === 'VACATION') leaveSummary.vacationDays++;
    }
  });

  // 2. Handle MONTHLY_NOSCAN
  if (payType === 'MONTHLY_NOSCAN') {
    attendanceSummary.presentDays = scheduledWorkDays - attendanceSummary.leaveDays;
    // late, absent are 0 by default
  } else {
    // 3. Handle scan-required types (MONTHLY, DAILY)
    let tempAbsentUnits = 0;
    periodDays.forEach(day => {
      // Basic checks again for each day
      if (userStartDate && isBefore(day, userStartDate)) return;
      if (userEndDate && isAfter(day, userEndDate)) return;
      const dayStr = format(day, 'yyyy-MM-dd');
      if (holidays.has(dayStr)) return;
      const isWeekendDay = (weekendMode === 'SAT_SUN' && (isSaturday(day) || isSunday(day))) || (weekendMode === 'SUN_ONLY' && isSunday(day));
      if (isWeekendDay) return;
      const onLeave = userLeavesApprovedYear.find(l => isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));
      if (onLeave) return;

      // Attendance logic
      const adjustmentForDay = userAdjustments.find(a => a.date === dayStr);
      const attendanceForDay = userAttendance.filter(a => a.timestamp && format(a.timestamp.toDate(), 'yyyy-MM-dd') === dayStr);
      
      let firstIn = attendanceForDay.filter(a => a.type === 'IN').map(a => a.timestamp.toDate()).sort((a,b) => a.getTime() - b.getTime())[0] ?? null;
      let lastOut = attendanceForDay.filter(a => a.type === 'OUT').map(a => a.timestamp.toDate()).sort((a,b) => b.getTime() - a.getTime())[0] ?? null;

      if (adjustmentForDay?.type === 'ADD_RECORD') {
        if (adjustmentForDay.adjustedIn) firstIn = adjustmentForDay.adjustedIn.toDate();
        if (adjustmentForDay.adjustedOut) lastOut = adjustmentForDay.adjustedOut.toDate();
      }

      if (!firstIn) {
        tempAbsentUnits += 1; // Full day absent
        return;
      }
      
      const absentCutoff = set(day, { hours: absentCutoffHour, minutes: absentCutoffMinute });
      if (isAfter(firstIn, absentCutoff)) {
        tempAbsentUnits += 0.5; // Morning absent
      } else {
        const lateThreshold = set(day, { hours: workStartHour, minutes: workStartMinute + graceMinutes });
        const isForgiven = adjustmentForDay?.type === 'FORGIVE_LATE';
        if (isAfter(firstIn, lateThreshold) && !isForgiven) {
          attendanceSummary.lateDays++;
          attendanceSummary.lateMinutes += differenceInMinutes(firstIn, set(day, { hours: workStartHour, minutes: workStartMinute }));
        }
      }

      if (hrSettings.afternoonCutoffTime) {
          const afternoonCutoff = set(day, { hours: afternoonCutoffHour, minutes: afternoonCutoffMinute });
          if (isBefore(day, today) && (!lastOut || isBefore(lastOut, afternoonCutoff))) {
              tempAbsentUnits += 0.5;
          }
      }
    });

    attendanceSummary.absentUnits = Math.round(tempAbsentUnits * 2) / 2; // Round to nearest 0.5
    attendanceSummary.presentDays = Math.max(0, scheduledWorkDays - attendanceSummary.leaveDays - Math.floor(attendanceSummary.absentUnits));
  }

  // 4. Over-limit deductions
  (Object.keys(hrSettings.leavePolicy?.leaveTypes || {}) as TLeaveType[]).forEach(leaveType => {
      const policy = hrSettings.leavePolicy?.leaveTypes?.[leaveType];
      if (!policy?.annualEntitlement) return;

      const annualEntitlement = policy.annualEntitlement;
      const approvedLeavesOfYear = userLeavesApprovedYear.filter(l => l.leaveType === leaveType).sort((a,b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime());
      
      let daysTakenThisYear = 0;
      let overLimitDaysThisPeriod = 0;

      approvedLeavesOfYear.forEach(leave => {
          const leaveStart = parseISO(leave.startDate);
          const leaveEnd = parseISO(leave.endDate);

          for (let day = leaveStart; day <= leaveEnd; day.setDate(day.getDate() + 1)) {
              daysTakenThisYear++;
              if (daysTakenThisYear > annualEntitlement) {
                  if (isWithinInterval(day, {start: period.start, end: period.end})) {
                      overLimitDaysThisPeriod++;
                  }
              }
          }
      });
      leaveSummary.overLimitDays += overLimitDaysThisPeriod;
      
      const overLimitMode = policy.overLimitHandling?.mode;
      const salary = user.hr?.salaryMonthly;

      if (overLimitDaysThisPeriod > 0 && salary && overLimitMode === 'DEDUCT_SALARY') {
          const baseDays = policy.overLimitHandling?.salaryDeductionBaseDays || hrSettings.payroll?.salaryDeductionBaseDays || 26;
          const deductionAmount = (salary / baseDays) * overLimitDaysThisPeriod;
          autoDeductions.push({
              name: `หักลาเกินสิทธิ์ (${leaveType})`,
              amount: deductionAmount,
              notes: `${overLimitDaysThisPeriod} วัน`
          });
      } else if (overLimitDaysThisPeriod > 0 && overLimitMode === 'DISALLOW') {
          calcNotes += `คำเตือน: การลา${leaveType} เกินสิทธิ์ ${overLimitDaysThisPeriod} วัน แต่ระบบตั้งค่าไม่อนุญาตให้หักเงิน\n`;
      }
  });


  // 5. Absent deductions
  if (attendanceSummary.absentUnits > 0 && user.hr?.salaryMonthly && payType !== 'MONTHLY_NOSCAN') {
      const baseDays = hrSettings.payroll?.salaryDeductionBaseDays || 26;
      autoDeductions.push({
          name: `หักขาดงาน`,
          amount: (user.hr.salaryMonthly / baseDays) * attendanceSummary.absentUnits,
          notes: `${attendanceSummary.absentUnits} หน่วย`
      });
  }

  return { attendanceSummary, leaveSummary, calcNotes: calcNotes.trim(), autoDeductions };
}

    