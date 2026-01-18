"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicQueueNewPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ใหม่ (Mechanic)" description="รายการงานใหม่ที่รอการดำเนินการ" />
      <JobList department="MECHANIC" status="RECEIVED" />
    </>
  );
}
