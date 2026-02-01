
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function ManagementWithholdingTaxPage() {
  return (
    <>
      <PageHeader title="ใบหัก ณ ที่จ่าย" description="ค้นหาและจัดการใบหัก ณ ที่จ่ายทั้งหมด" />
      <DocumentList docType="WITHHOLDING_TAX" />
    </>
  );
}
