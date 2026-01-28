
"use client";

import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";

export default function OfficeJobManagementHistoryPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ประวัติงานซ่อม" description="งานที่ปิดไปแล้วทั้งหมด" />
      <JobTableList 
        status="CLOSED"
        limit={20}
        emptyTitle="ไม่มีประวัติงานซ่อม"
        emptyDescription="ยังไม่มีการเปิดงานที่ถูกปิดในระบบ"
      />
    </>
  );
}
