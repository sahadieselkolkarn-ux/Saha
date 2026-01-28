
"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";

export default function OfficeJobManagementDonePage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - งานเสร็จรอทำบิล" description="งานที่ซ่อมเสร็จแล้ว รอทำบิล" />
      <JobList 
        status="DONE"
        emptyTitle="ไม่มีงานที่เสร็จแล้ว"
        emptyDescription="ยังไม่มีงานที่อยู่ในสถานะ 'DONE' รอทำบิล"
      />
    </>
  );
}
