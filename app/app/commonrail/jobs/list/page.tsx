"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CommonrailJobsListPage() {
  return (
    <>
      <PageHeader title="งานของแผนก Commonrail" description="งานทั้งหมดที่อยู่ในความรับผิดชอบของแผนก Commonrail" />
      <JobList department="COMMONRAIL" />
    </>
  );
}
