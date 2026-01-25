"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceAllJobsPage() {
  return (
    <>
      <PageHeader title="งานทั้งหมด" description="งานใหม่และงานที่กำลังทำทั้งหมดในแผนก Car Service" />
      <JobList 
        department="CAR_SERVICE" 
        status={['RECEIVED', 'IN_PROGRESS', 'IN_REPAIR_PROCESS']} 
      />
    </>
  );
}
