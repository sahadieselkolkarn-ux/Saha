"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceQueueNewPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ใหม่ (Car Service)" description="รายการงานใหม่ที่รอการดำเนินการ" />
      <JobList department="CAR_SERVICE" status="RECEIVED" />
    </>
  );
}
