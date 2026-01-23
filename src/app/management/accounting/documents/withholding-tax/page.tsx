
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function WithholdingTaxPage() {
  return (
    <>
      <PageHeader title="ใบหัก ภาษี ณ ที่จ่าย" description="สร้างและจัดการใบหัก ณ ที่จ่าย" />
      <DocumentList docType="WITHHOLDING_TAX" />
    </>
  );
}
