
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function ReceiptPage() {
  return (
     <>
      <PageHeader title="ใบเสร็จรับเงิน" description="สร้างและจัดการใบเสร็จรับเงิน" />
      <DocumentList docType="RECEIPT" />
    </>
  );
}
