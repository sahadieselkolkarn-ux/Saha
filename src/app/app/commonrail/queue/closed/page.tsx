"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailQueueClosedPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ปิดงาน (Commonrail)" description="รายการงานที่ปิดไปแล้ว" />
      <JobList department="COMMONRAIL" status="CLOSED" />
    </>
  );
}
