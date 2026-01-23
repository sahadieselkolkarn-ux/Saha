export const DEPARTMENTS = ["MANAGEMENT", "OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const USER_ROLES = ["ADMIN", "MANAGER", "OFFICER", "WORKER"] as const;
export type Role = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = ["RECEIVED", "IN_PROGRESS", "WAITING_QUOTATION", "WAITING_APPROVE", "PENDING_PARTS", "IN_REPAIR_PROCESS", "DONE", "WAITING_CUSTOMER_PICKUP", "CLOSED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  RECEIVED: "งานใหม่",
  IN_PROGRESS: "เริ่มดำเนินการ",
  WAITING_QUOTATION: "รอเสนอราคา",
  WAITING_APPROVE: "รอลูกค้าอนุมัติ",
  PENDING_PARTS: "กำลังจัดอะไหล่",
  IN_REPAIR_PROCESS: "ดำเนินการซ่อม",
  DONE: "งานเรียบร้อย",
  WAITING_CUSTOMER_PICKUP: "รอลูกค้ารับสินค้า",
  CLOSED: "ปิดงาน",
};

export const JOB_DEPARTMENTS = ["OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number];

export const LEAVE_TYPES = ["SICK", "BUSINESS", "VACATION"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const PAYROLL_STATUSES = ["DRAFT_HR", "SENT_TO_EMPLOYEE", "FINAL"] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];


export const TOKEN_TTL_MS = 30000; // 30 seconds
export const TOKEN_BUFFER_MS = 5000; // 5 seconds buffer
