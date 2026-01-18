"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobsPendingPage() {
  return (
    <>
      <PageHeader title="งานรอดำเนินการ" description="รายการงานที่รับเข้ามาและรอส่งต่อให้แผนกซ่อม" />
      
      <JobList
        status="RECEIVED"
        orderByField="createdAt"
        emptyTitle="No Pending Jobs"
        emptyDescription="There are no jobs awaiting action."
      />
    </>
  );
}
