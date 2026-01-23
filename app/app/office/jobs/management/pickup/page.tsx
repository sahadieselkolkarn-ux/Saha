"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementPickupPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม - รอลูกค้ารับสินค้า" description="งานที่ซ่อมเสร็จและทำบิลแล้ว รอลูกค้ามารับ" />
      <JobList 
        status="WAITING_CUSTOMER_PICKUP"
        emptyTitle="ไม่มีงานที่รอลูกค้ารับของ"
        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_CUSTOMER_PICKUP"
      />
    </>
  );
}
