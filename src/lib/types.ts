import type { Timestamp } from 'firebase/firestore';
import type { JobStatus, JobDepartment, Role, UserStatus, Department, LeaveType, LeaveStatus, PayrollStatus, AccountingCategory } from './constants';

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
    startDate?: string; // YYYY-MM-DD
    endDate?: string | null; // YYYY-MM-DD or null
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

export interface Vendor {
    id: string;
    shortName: string;
    companyName: string;
    address?: string;
    phone?: string;
    contactName?: string;
    contactPhone?: string;
    email?: string;
    taxId?: string;
    notes?: string;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface Job {
  id: string;
  customerId: string;
  customerSnapshot: {
    name: string;
    phone: string;
    useTax?: boolean;
  };
  department: JobDepartment;
  status: JobStatus;
  description: string;
  photos: string[];
  technicalReport?: string;
  assigneeUid?: string;
  assigneeName?: string;
  carServiceDetails?: {
    brand?: string;
    model?: string;
    licensePlate?: string;
  };
  commonrailDetails?: {
    brand?: string;
    partNumber?: string;
    registrationNumber?: string;
  };
  mechanicDetails?: {
    brand?: string;
    partNumber?: string;
    registrationNumber?: string;
  };
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
  weekendPolicy?: {
    mode?: 'SAT_SUN' | 'SUN_ONLY';
  };
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

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  reason: string;
  status: LeaveStatus;
  year: number;
  approvedByName?: string;
  approvedAt?: Timestamp;
  rejectedByName?: string;
  rejectedAt?: Timestamp;
  rejectReason?: string;
  overLimit?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttendanceAdjustment {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: 'ADD_RECORD' | 'FORGIVE_LATE';
  adjustedIn?: Timestamp;
  adjustedOut?: Timestamp;
  notes: string;
  updatedBy: string; // User's name
  updatedById: string; // User's UID
  updatedAt: Timestamp;
}

export interface PayrollRun {
  id: string;
  year: number;
  month: number; // 1-12
  period: 1 | 2;
  status: PayrollStatus;
  createdAt: Timestamp;
  finalizedAt?: Timestamp;
}

export interface PayslipDeduction {
    name: string;
    amount: number;
    notes?: string;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  userId: string;
  userName: string;
  baseSalary: number;
  deductions: PayslipDeduction[];
  netSalary: number;
  isOverridden?: boolean;
  overrideNotes?: string;
  // Fields for employee review flow
  employeeStatus?: 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED';
  employeeAccepted?: boolean;
  employeeAcceptedAt?: Timestamp | null;
  employeeNote?: string | null;
  sentToEmployeeAt?: Timestamp;
  // Fields for HR audit
  hrCheckedByName?: string;
  hrCheckedAt?: Timestamp;
  hrNote?: string | null;
}

export interface StoreSettings {
  id?: 'store';
  taxName?: string;
  taxAddress?: string;
  branch?: string;
  phone?: string;
  taxId?: string;
  informalName?: string;
  openingHours?: string;
}

export interface DocumentSettings {
  id?: 'documents';
  quotationPrefix?: string;
  deliveryNotePrefix?: string;
  taxInvoicePrefix?: string;
  receiptPrefix?: string;
  billingNotePrefix?: string;
  creditNotePrefix?: string;
  withholdingTaxPrefix?: string;
}

export interface DocumentItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type DocType = 'QUOTATION' | 'DELIVERY_NOTE' | 'TAX_INVOICE' | 'RECEIPT' | 'BILLING_NOTE' | 'CREDIT_NOTE' | 'WITHHOLDING_TAX';

export interface Document {
  id: string;
  docType: DocType;
  docNo: string;
  docDate: string; // YYYY-MM-DD
  jobId?: string;
  customerSnapshot: Partial<Customer>;
  carSnapshot?: {
    licensePlate?: string;
    details?: string;
  };
  storeSnapshot: Partial<StoreSettings>;
  items: DocumentItem[];
  subtotal: number;
  discountAmount: number;
  net: number; // subtotal - discount
  withTax: boolean;
  vatAmount: number;
  grandTotal: number;
  notes?: string;
  status: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Doc-specific fields
  expiryDate?: string; // For Quotation
  dueDate?: string; // For TaxInvoice
  paymentMethod?: string; // For Receipt
  paymentDate?: string; // For Receipt
  referencesDocIds?: string[]; // For CreditNote and Receipt
  reason?: string; // For CreditNote
  invoiceIds?: string[]; // For BillingNote
  totalAmount?: number; // For BillingNote
}

export interface DocumentCounters {
  year: number;
  quotation?: number;
  deliveryNote?: number;
  taxInvoice?: number;
  receipt?: number;
  billingNote?: number;
  creditNote?: number;
  withholdingTax?: number;
}

export interface AccountingAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK';
  bankName?: string;
  accountNo?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  openingBalance?: number;
  openingBalanceDate?: string; // YYYY-MM-DD
  openingBalanceSetByUid?: string;
  openingBalanceSetAt?: Timestamp;
}

export interface AccountingEntry {
  id: string;
  entryType: 'RECEIPT' | 'CASH_IN' | 'CASH_OUT';
  entryDate: string; // YYYY-MM-DD
  amount: number;
  accountId: string;
  createdAt: Timestamp;
  // --- Fields for RECEIPT ---
  sourceDocType?: DocType;
  sourceDocId?: string;
  sourceDocNo?: string;
  referenceInvoiceId?: string;
  customerNameSnapshot?: string;
  jobId?: string;
  // --- Fields for CASH_IN/CASH_OUT ---
  description?: string;
  category?: AccountingCategory; // Legacy field
  categoryMain?: string; // New field
  categorySub?: string; // New field
  paymentMethod?: 'CASH' | 'TRANSFER' | 'CREDIT';
  vendorId?: string;
  vendorShortNameSnapshot?: string;
  vendorNameSnapshot?: string;
  counterpartyNameSnapshot?: string; // For one-off individuals not in vendors
}
    
    
    
    
    
    

    

    

    

    
