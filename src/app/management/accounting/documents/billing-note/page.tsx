
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function BillingNotePage() {
  return (
    <>
      <PageHeader title="ใบวางบิล" description="สร้างและจัดการใบวางบิล" />
      <DocumentList docType="BILLING_NOTE" />
    </>
  );
}
