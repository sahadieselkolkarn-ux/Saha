"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailQueueDonePage() {
  return (
    <>
      <PageHeader title="คิวงาน - เสร็จแล้ว (Commonrail)" description="รายการงานที่ซ่อมเสร็จแล้ว" />
      <JobList department="COMMONRAIL" status="DONE" />
    </>
  );
}
