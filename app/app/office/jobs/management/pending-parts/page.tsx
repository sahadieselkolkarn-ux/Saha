
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementPendingPartsPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม - กำลังจัดอะไหล่" description="งานที่อนุมัติแล้ว และรอการจัดหาอะไหล่" />
      <JobList 
        status="PENDING_PARTS"
        actionPreset="pendingPartsReady"
        emptyTitle="ไม่มีงานที่รอจัดอะไหล่"
        emptyDescription="ไม่มีงานที่อยู่ในสถานะ PENDING_PARTS ในขณะนี้"
      />
    </>
  );
}
