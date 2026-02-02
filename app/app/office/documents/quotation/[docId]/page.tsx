
"use client";

import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';

export default function EditQuotationPage({ params }: { params: { docId: string } }) {
  const { docId } = params;

  return (
    <>
      <PageHeader
        title="แก้ไขใบเสนอราคา"
        description="แก้ไขรายละเอียดของเอกสารและบันทึก"
      />
      <QuotationForm jobId={null} editDocId={docId} />
    </>
  );
}
