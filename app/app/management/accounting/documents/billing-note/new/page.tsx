
"use client";

import { PageHeader } from "@/components/page-header";
import { BillingNoteForm } from "@/components/billing-note-form";

export default function NewBillingNotePage() {
  return (
    <>
      <PageHeader
        title="สร้างใบวางบิล (รายลูกค้า)"
        description="เลือกใบกำกับภาษีที่ยังไม่จ่ายของลูกค้าเพื่อสร้างใบวางบิล"
      />
      <BillingNoteForm />
    </>
  );
}
