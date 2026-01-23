
"use client";

import { PageHeader } from '@/components/page-header';
import { TaxInvoiceForm } from '@/components/tax-invoice-form';

function NewTaxInvoicePage() {
  return (
    <>
      <PageHeader title="สร้างใบกำกับภาษี" description="กรอกรายละเอียดเพื่อสร้างใบกำกับภาษีใหม่" />
      <TaxInvoiceForm />
    </>
  );
}

export default NewTaxInvoicePage;
