
"use client";

import { PageHeader } from "@/components/page-header";
import { BillingNoteForm } from "@/components/billing-note-form";

export default function NewBillingNotePage() {
  return (
    <>
      <PageHeader title="สร้างใบวางบิล" description="เลือกรายการใบกำกับภาษีเพื่อรวมในใบวางบิล" />
      <BillingNoteForm />
    </>
  );
}
