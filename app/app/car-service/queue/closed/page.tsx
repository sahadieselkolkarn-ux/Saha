"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceQueueClosedPage() {
  return (
    <>
      <PageHeader title="คิวงาน - ปิดงาน (Car Service)" description="รายการงานที่ปิดไปแล้ว" />
      <JobList department="CAR_SERVICE" status="CLOSED" />
    </>
  );
}
