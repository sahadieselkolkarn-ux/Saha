"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function ManagementWithholdingTaxPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="ใบหัก ณ ที่จ่าย" description="ค้นหาและจัดการใบหัก ณ ที่จ่ายทั้งหมด" />
      
      <Alert variant="secondary" className="bg-amber-50 border-amber-200 text-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>ฟีเจอร์นี้ยังไม่พร้อมใช้งานเต็มรูปแบบ</AlertTitle>
          <AlertDescription>
              ขณะนี้ระบบแสดงรายการเพื่อเป็นเอกสารอ้างอิงทางบัญชีเท่านั้น ฟังก์ชันการสร้างเอกสารใหม่ผ่านหน้าจอนี้กำลังอยู่ระหว่างการพัฒนา
          </AlertDescription>
      </Alert>

      <DocumentList docType="WITHHOLDING_TAX" baseContext="accounting" />
    </div>
  );
}
