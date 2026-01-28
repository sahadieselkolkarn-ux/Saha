
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementCarServicePage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - งานซ่อมหน้าร้าน" description="งานทั้งหมดของแผนก Car Service" />
      <JobList 
        department="CAR_SERVICE" 
        excludeStatus={["CLOSED"]}
        emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
      />
    </>
  );
}
