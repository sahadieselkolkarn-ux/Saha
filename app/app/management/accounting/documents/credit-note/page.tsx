"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function ManagementCreditNotesPage() {
  return (
    <div className="space-y-6">
        <PageHeader title="ใบลดหนี้" description="จัดการข้อมูลใบลดหนี้" />
        
        <Alert variant="secondary" className="bg-amber-50 border-amber-200 text-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>ฟีเจอร์นี้ยังไม่พร้อมใช้งานเต็มรูปแบบ</AlertTitle>
            <AlertDescription>
                ขณะนี้ระบบแสดงรายการใบลดหนี้เพื่อเป็นเอกสารอ้างอิงทางบัญชีเท่านั้น ฟังก์ชันการสร้างและแก้ไขเอกสารใหม่กำลังอยู่ระหว่างการพัฒนา
            </AlertDescription>
        </Alert>

        <DocumentList docType="CREDIT_NOTE" baseContext="accounting" />
    </div>
  );
}
