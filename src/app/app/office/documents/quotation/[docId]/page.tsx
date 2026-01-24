
"use client";

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';

function EditQuotationPageContent() {
  const params = useParams();
  const docId = params.docId as string;

  return (
    <>
      <PageHeader title="แก้ไขใบเสนอราคา" description="แก้ไขรายละเอียดของเอกสารและบันทึก" />
      <QuotationForm editDocId={docId} jobId={null} />
    </>
  );
}

export default function EditQuotationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>}>
      <EditQuotationPageContent />
    </Suspense>
  );
}
