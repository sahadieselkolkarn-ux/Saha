
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementOutsourcePage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - งานส่งออกร้านนอก" description="งานทั้งหมดที่ส่งออกไปให้ร้านนอก" />
      <JobList 
        department="OUTSOURCE" 
        excludeStatus={["CLOSED"]}
        emptyTitle="ไม่มีงานที่ส่งออกร้านนอก"
        emptyDescription="ยังไม่มีการส่งต่องานสำหรับแผนกนี้"
      />
    </>
  );
}
