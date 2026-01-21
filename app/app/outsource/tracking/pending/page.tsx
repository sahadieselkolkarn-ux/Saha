"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OutsourceTrackingPendingPage() {
  return (
    <>
      <PageHeader title="ติดตาม - รอส่ง" description="รายการงานที่โอนมาแผนก Outsource และรอส่งออกไปร้านนอก" />
      <JobList department="OUTSOURCE" status="RECEIVED" />
    </>
  );
}
