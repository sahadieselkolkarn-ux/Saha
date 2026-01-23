
"use client";

import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';
import { TaxInvoiceForm } from '@/components/tax-invoice-form';


function NewTaxInvoicePage() {
  return (
    <>
      <PageHeader title="สร้างใบกำกับภาษี" description="กรอกรายละเอียดเพื่อสร้างใบกำกับภาษีใหม่" />
      <Suspense fallback={<div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <TaxInvoiceForm />
      </Suspense>
    </>
  );
}

export default NewTaxInvoicePage;

    