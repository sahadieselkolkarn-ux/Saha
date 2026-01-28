
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementMechanicPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - แผนกปั๊มหัวฉีดแมคคานิค" description="งานทั้งหมดของแผนก Mechanic" />
      <JobList 
        department="MECHANIC" 
        excludeStatus={["CLOSED"]}
        emptyTitle="ไม่มีงานในแผนกแมคคานิค"
        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
      />
    </>
  );
}
