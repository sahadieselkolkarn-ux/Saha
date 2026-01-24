
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';

function NewQuotationPageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const editDocId = searchParams.get("editDocId");

  const title = editDocId ? "แก้ไขและสร้างใบเสนอราคาใหม่" : "สร้างใบเสนอราคา";
  const description = editDocId
    ? "แก้ไขรายละเอียดด้านล่างแล้วบันทึกเพื่อสร้างเอกสารฉบับใหม่"
    : "กรอกรายละเอียดเพื่อสร้างใบเสนอราคาใหม่สำหรับงาน";

  return (
    <>
      <PageHeader title={title} description={description} />
      <QuotationForm jobId={jobId} editDocId={editDocId} />
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
