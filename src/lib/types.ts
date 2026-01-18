import type { Timestamp } from 'firebase/firestore';
import type { Role, Department, UserStatus, JobStatus, JobDepartment } from './constants';

export interface UserProfile {
  uid: string;
  displayName: string;
  phone: string;
  email: string;
  role: Role | "";
  department: Department | "";
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt: Timestamp | null;
  approvedBy: string | null;
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
  assigneeUid?: string;
  assigneeName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivityAt: Timestamp;
  activities?: JobActivity[];
}

export interface JobActivity {
  id: string;
  text: string;
  userName: string;
  userId: string;
  createdAt: Timestamp;
  photos?: string[];
}
