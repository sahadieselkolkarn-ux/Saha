export const DEPARTMENTS = ["MANAGEMENT", "OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const USER_ROLES = ["ADMIN", "OFFICER", "WORKER"] as const;
export type Role = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = ["RECEIVED", "IN_PROGRESS", "DONE", "CLOSED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_DEPARTMENTS = ["CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number];
