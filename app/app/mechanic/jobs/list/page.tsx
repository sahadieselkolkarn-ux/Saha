"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function MechanicJobsListPage() {
  return (
    <>
      <PageHeader title="งานของแผนก Mechanic" description="งานทั้งหมดที่อยู่ในความรับผิดชอบของแผนก Mechanic" />
      <JobList department="MECHANIC" />
    </>
  );
}
