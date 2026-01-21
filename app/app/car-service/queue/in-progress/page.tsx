"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceQueueInProgressPage() {
  return (
    <>
      <PageHeader title="คิวงาน - กำลังทำ (Car Service)" description="รายการงานที่กำลังดำเนินการซ่อม" />
      <JobList department="CAR_SERVICE" status="IN_PROGRESS" />
    </>
  );
}
