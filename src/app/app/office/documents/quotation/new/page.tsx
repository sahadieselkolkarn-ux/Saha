"use client";

import { Suspense } from 'react';
import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';

function NewQuotationPage() {
  return (
    <>
      <PageHeader title="สร้างใบเสนอราคา" description="กรอกรายละเอียดเพื่อสร้างใบเสนอราคาใหม่สำหรับงาน" />
      <Suspense fallback={<div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <QuotationForm />
      </Suspense>
    </>
  );
}

export default NewQuotationPage;
