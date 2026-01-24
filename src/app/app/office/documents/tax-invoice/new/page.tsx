
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { TaxInvoiceForm } from '@/components/tax-invoice-form';
import { Loader2 } from 'lucide-react';


function NewTaxInvoicePageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const editDocId = searchParams.get("editDocId");

  const title = editDocId ? "แก้ไขและสร้างใบกำกับภาษีใหม่" : "สร้างใบกำกับภาษี";
  const description = editDocId
    ? "แก้ไขรายละเอียดด้านล่างแล้วบันทึกเพื่อสร้างเอกสารฉบับใหม่"
    : "กรอกรายละเอียดเพื่อสร้างใบกำกับภาษีใหม่";

  return (
    <>
      <PageHeader title={title} description={description} />
      <TaxInvoiceForm jobId={jobId} editDocId={editDocId} />
    </>
  );
}

export default function NewTaxInvoicePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>}>
      <NewTaxInvoicePageContent />
    </Suspense>
  );
}
