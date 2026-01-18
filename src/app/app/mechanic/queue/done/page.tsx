"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicQueueDonePage() {
  return (
    <>
      <PageHeader title="คิวงาน - เสร็จแล้ว (Mechanic)" description="รายการงานที่ซ่อมเสร็จแล้ว" />
      <JobList department="MECHANIC" status="DONE" />
    </>
  );
}
