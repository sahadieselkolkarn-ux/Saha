"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementHistoryPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม - ประวัติงานซ่อม" description="งานที่ปิดไปแล้วทั้งหมด" />
      <JobList 
        status="CLOSED"
        limit={20}
        emptyTitle="ไม่มีประวัติงานซ่อม"
        emptyDescription="ยังไม่มีการเปิดงานที่ถูกปิดในระบบ"
      />
    </>
  );
}
