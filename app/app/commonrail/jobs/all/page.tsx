"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailAllJobsPage() {
  return (
    <>
      <PageHeader title="งานทั้งหมด" description="งานใหม่และงานที่กำลังทำทั้งหมดในแผนก Commonrail" />
      <JobList 
        department="COMMONRAIL" 
        status={['RECEIVED', 'IN_PROGRESS', 'WAITING_QUOTATION', 'WAITING_APPROVE', 'PENDING_PARTS', 'IN_REPAIR_PROCESS']} 
      />
    </>
  );
}
