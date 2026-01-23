
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';

function NewQuotationPageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  return (
    <>
      <PageHeader title="สร้างใบเสนอราคา" description="กรอกรายละเอียดเพื่อสร้างใบเสนอราคาใหม่สำหรับงาน" />
      <QuotationForm jobId={jobId} />
    </>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>}>
      <NewQuotationPageContent />
    </Suspense>
  );
}
