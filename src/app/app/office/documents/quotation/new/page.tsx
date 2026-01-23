
"use client";

import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';

function NewQuotationPage() {
  return (
    <>
      <PageHeader title="สร้างใบเสนอราคา" description="กรอกรายละเอียดเพื่อสร้างใบเสนอราคาใหม่สำหรับงาน" />
      <QuotationForm />
    </>
  );
}

export default NewQuotationPage;
