
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementQuotationPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - งานเสนอราคา" description="งานที่รอการสร้างใบเสนอราคา" />
      <JobList 
        status='WAITING_QUOTATION'
        emptyTitle="ไม่มีงานที่รอเสนอราคา"
        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_QUOTATION ในขณะนี้"
      />
    </>
  );
}
