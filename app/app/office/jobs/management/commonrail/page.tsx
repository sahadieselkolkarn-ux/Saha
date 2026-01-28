
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementCommonrailPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - แผนกปั๊มหัวฉีดคอมมอนเรล" description="งานทั้งหมดของแผนก Commonrail" />
      <JobList 
        department="COMMONRAIL" 
        excludeStatus={["CLOSED"]}
        emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
      />
    </>
  );
}
