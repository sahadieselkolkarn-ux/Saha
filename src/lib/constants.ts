export const DEPARTMENTS = ["MANAGEMENT", "OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const USER_ROLES = ["ADMIN", "MANAGER", "OFFICER", "WORKER"] as const;
export type Role = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = ["RECEIVED", "IN_PROGRESS", "DONE", "CLOSED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_DEPARTMENTS = ["OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number];

export const TOKEN_TTL_MS = 30000; // 30 seconds
export const TOKEN_BUFFER_MS = 5000; // 5 seconds buffer
