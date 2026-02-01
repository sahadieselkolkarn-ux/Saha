"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentSettingsForm } from "@/components/document-settings-form";

export default function ManagementSettingsDocumentsPage() {
  return (
    <>
      <PageHeader title="ตั้งค่าเลขที่เอกสาร" description="ตั้งค่ารูปแบบเลขที่เอกสารต่างๆ" />
      <div className="max-w-2xl mx-auto">
        <DocumentSettingsForm />
      </div>
    </>
  );
}
