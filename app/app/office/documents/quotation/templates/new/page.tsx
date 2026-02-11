"use client";

import { PageHeader } from "@/components/page-header";
import { QuotationTemplateForm } from "@/components/quotation-template-form";

export default function NewQuotationTemplatePage() {
  return (
    <>
      <PageHeader title="สร้าง Template ใหม่" description="บันทึกชุดรายการสินค้ามาตรฐานเพื่อประหยัดเวลา" />
      <QuotationTemplateForm />
    </>
  );
}
