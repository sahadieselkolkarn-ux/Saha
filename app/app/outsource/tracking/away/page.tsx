"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OutsourceTrackingAwayPage() {
  return (
    <>
      <PageHeader title="ติดตาม - อยู่ร้านนอก" description="รายการงานที่กำลังดำเนินการอยู่ที่ร้านนอก" />
      <JobList department="OUTSOURCE" status="IN_PROGRESS" />
    </>
  );
}
