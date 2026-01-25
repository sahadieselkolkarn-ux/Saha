
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementWaitingApprovePage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม - รอลูกค้าอนุมัติ" description="งานที่ส่งใบเสนอราคาแล้ว และรอลูกค้าตอบกลับ" />
      <JobList 
        status="WAITING_APPROVE"
        actionPreset="waitingApprove"
        emptyTitle="ไม่มีงานที่รอลูกค้าอนุมัติ"
        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_APPROVE ในขณะนี้"
      />
    </>
  );
}
