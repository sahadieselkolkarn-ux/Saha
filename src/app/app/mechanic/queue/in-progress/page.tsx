"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicQueueInProgressPage() {
  return (
    <>
      <PageHeader title="คิวงาน - กำลังทำ (Mechanic)" description="รายการงานที่กำลังดำเนินการซ่อม" />
      <JobList department="MECHANIC" status="IN_PROGRESS" />
    </>
  );
}
