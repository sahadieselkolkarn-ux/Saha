
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { TaxInvoiceForm } from '@/components/tax-invoice-form';
import { Loader2 } from 'lucide-react';


function NewTaxInvoicePageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  return (
    <>
      <PageHeader title="สร้างใบกำกับภาษี" description="กรอกรายละเอียดเพื่อสร้างใบกำกับภาษีใหม่" />
      <TaxInvoiceForm jobId={jobId} />
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
