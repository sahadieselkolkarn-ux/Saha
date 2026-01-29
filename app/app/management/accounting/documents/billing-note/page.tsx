
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingNoteForm } from "@/components/billing-note-form";

export default function BillingNotePage() {
  return (
    <>
      <PageHeader title="ใบวางบิล" description="สร้างและจัดการใบวางบิล">
         <div className="flex items-center gap-2">
            <Button asChild>
                <Link href="/app/management/accounting/documents/billing-note/batch">
                    สรุปยอดทั้งเดือน (อัตโนมัติ)
                </Link>
            </Button>
        </div>
      </PageHeader>
      
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
            <TabsTrigger value="list">รายการใบวางบิล</TabsTrigger>
            <TabsTrigger value="new">สร้างใหม่ (รายลูกค้า)</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
            <DocumentList docType="BILLING_NOTE" />
        </TabsContent>
        <TabsContent value="new">
            <Card>
                <CardHeader>
                    <CardTitle>สร้างใบวางบิล (รายลูกค้า)</CardTitle>
                    <CardDescription>เลือกใบกำกับภาษีที่ยังไม่จ่ายของลูกค้าเพื่อสร้างใบวางบิล</CardDescription>
                </CardHeader>
                <CardContent>
                    <BillingNoteForm />
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
