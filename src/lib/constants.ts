export const DEPARTMENTS = ["MANAGEMENT", "OFFICE", "CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;

export const JOB_STATUSES = ["RECEIVED", "IN_PROGRESS", "DONE", "CLOSED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_DEPARTMENTS = ["CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number];
