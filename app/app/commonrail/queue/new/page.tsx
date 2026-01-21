"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailQueueNewPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ใหม่ (Commonrail)" description="รายการงานใหม่ที่รอการดำเนินการ" />
      <JobList department="COMMONRAIL" status="RECEIVED" />
    </>
  );
}
