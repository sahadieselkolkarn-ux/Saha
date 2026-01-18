"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OutsourceTrackingReturnedPage() {
  return (
    <>
      <PageHeader title="ติดตาม - รับกลับแล้ว" description="รายการงานที่รับกลับจากร้านนอกแล้ว และรอดำเนินการต่อ" />
      <JobList department="OUTSOURCE" status="DONE" />
    </>
  );
}
