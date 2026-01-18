"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function CarServiceJobsListPage() {
  return (
    <>
      <PageHeader title="งานของแผนก Car Service" description="งานทั้งหมดที่อยู่ในความรับผิดชอบของแผนก Car Service" />
      <JobList department="CAR_SERVICE" />
    </>
  );
}
