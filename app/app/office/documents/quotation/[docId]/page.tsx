"use client";

import React from 'react';
import { QuotationForm } from '@/components/quotation-form';
import { PageHeader } from '@/components/page-header';

export default function EditQuotationPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = React.use(params);

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
