"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceQueueDonePage() {
  return (
    <>
      <PageHeader title="คิวงาน - เสร็จแล้ว (Car Service)" description="รายการงานที่ซ่อมเสร็จแล้ว" />
      <JobList department="CAR_SERVICE" status="DONE" />
    </>
  );
}
