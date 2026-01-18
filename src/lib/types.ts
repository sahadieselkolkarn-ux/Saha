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
    salary?: number;
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
  activities?: JobActivity[];
}

export interface JobActivity {
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
