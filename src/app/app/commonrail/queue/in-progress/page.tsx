"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailQueueInProgressPage() {
  return (
    <>
      <PageHeader title="คิวงาน - กำลังทำ (Commonrail)" description="รายการงานที่กำลังดำเนินการซ่อม" />
      <JobList department="COMMONRAIL" status="IN_PROGRESS" />
    </>
  );
}
