import type { Timestamp } from 'firebase/firestore';
import type { JobStatus, JobDepartment, Role, UserStatus, Department } from './constants';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  role: Role;
  department?: Department;
  status: UserStatus;
  personal?: {
    idCardNo?: string;
    address?: string;
    bank?: {
      bankName?: string;
      accountName?: string;
      accountNo?: string;
    };
    emergencyContact?: {
      name?: string;
      relationship?: string;
      phone?: string;
    };
  };
  hr?: {
    salaryMonthly?: number;
    payType?: 'MONTHLY' | 'DAILY';
    ssoHospital?: string;
    note?: string;
  };
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  lastAttendance?: {
    type: 'IN' | 'OUT';
    timestamp: Timestamp;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  detail: string;
  useTax: boolean;
  taxName?: string;
  taxAddress?: string;
  taxId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Job {
  id: string;
  customerId: string;
  customerSnapshot: {
    name: string;
    phone: string;
  };
  department: JobDepartment;
  status: JobStatus;
  description: string;
  photos: string[];
  technicalReport?: string;
  assigneeUid?: string;
  assigneeName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivityAt: Timestamp;
}

export interface JobActivity {
  id?: string;
  text: string;
  userName: string;
  userId: string;
  createdAt: Timestamp;
  photos?: string[];
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  type: 'IN' | 'OUT';
  timestamp: Timestamp;
}

export interface KioskToken {
  id: string;
  createdAtMs: number;
  expiresAtMs: number;
  isActive: boolean;
}

export interface LeaveTypePolicy {
  annualEntitlement?: number;
  overLimitHandling?: {
    mode?: 'DEDUCT_SALARY' | 'UNPAID' | 'DISALLOW';
    salaryDeductionBaseDays?: number;
  };
}

export interface HRSettings {
  id?: 'hr';
  workStart?: string;
  workEnd?: string;
  breakStart?: string;
  breakEnd?: string;
  graceMinutes?: number;
  absentCutoffTime?: string;
  minSecondsBetweenScans?: number;
  payroll?: {
    payday1?: number;
    payday2?: string;
    period1Start?: number;
    period1End?: number;
    period2Start?: number;
    period2End?: string;
  };
  sso?: {
    employeePercent?: number;
    employerPercent?: number;
    monthlyCap?: number;
    effectiveFrom?: Timestamp;
  };
  withholding?: {
    enabled?: boolean;
    defaultPercent?: number;
    note?: string;
  };
  leavePolicy?: {
    calculationPeriod?: 'CALENDAR_YEAR';
    leaveTypes?: {
      SICK?: LeaveTypePolicy;
      BUSINESS?: LeaveTypePolicy;
      VACATION?: LeaveTypePolicy;
    };
  };
}

export interface HRHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  createdAt: Timestamp;
}
