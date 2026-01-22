"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicAllJobsPage() {
  return (
    <>
      <PageHeader title="งานทั้งหมด" description="งานใหม่และงานที่กำลังทำทั้งหมดในแผนก Mechanic" />
      <JobList 
        department="MECHANIC" 
        status={['RECEIVED', 'IN_PROGRESS']} 
      />
    </>
  );
}
