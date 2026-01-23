"use client";

import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// This is a placeholder for now. The logic would be similar to QuotationForm.
function TaxInvoiceForm() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>New Tax Invoice</CardTitle>
                <CardDescription>This feature is under development.</CardDescription>
            </CardHeader>
            <CardContent>
                <p>The form to create a new tax invoice from a job will be here.</p>
            </CardContent>
        </Card>
    );
}


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
