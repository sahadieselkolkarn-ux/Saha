"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { ReceiptForm } from "@/components/receipt-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function ManagementReceiptsPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}>
            <Tabs defaultValue="list">
                <PageHeader title="ใบเสร็จรับเงิน" description="สร้างและจัดการใบเสร็จรับเงิน">
                    <TabsList>
                        <TabsTrigger value="list">รายการทั้งหมด</TabsTrigger>
                        <TabsTrigger value="new">สร้างใหม่</TabsTrigger>
                    </TabsList>
                </PageHeader>
                <TabsContent value="list">
                    <DocumentList
                        docType="RECEIPT"
                        baseContext="accounting"
                    />
                </TabsContent>
                <TabsContent value="new">
                    <ReceiptForm />
                </TabsContent>
            </Tabs>
        </Suspense>
    );
}
