
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function CreditNotePage() {
  return (
    <>
      <PageHeader title="ใบลดหนี้" description="สร้างและจัดการใบลดหนี้" />
      <DocumentList docType="CREDIT_NOTE" />
    </>
  );
}
