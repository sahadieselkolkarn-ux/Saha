"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementQuotationPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม - งานเสนอราคา" description="งานที่รอเสนอราคา หรือรอลูกค้าอนุมัติ" />
      <JobList 
        status={['WAITING_QUOTATION', 'WAITING_APPROVE']}
        emptyTitle="ไม่มีงานที่รอเสนอราคา"
        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_QUOTATION หรือ WAITING_APPROVE"
      />
    </>
  );
}
