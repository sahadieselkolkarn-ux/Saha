"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicQueueClosedPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ปิดงาน (Mechanic)" description="รายการงานที่ปิดไปแล้ว" />
      <JobList department="MECHANIC" status="CLOSED" />
    </>
  );
}
