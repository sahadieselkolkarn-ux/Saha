"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { ReceiptForm } from "@/components/receipt-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ManagementReceiptsPage() {
    return (
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
                />
            </TabsContent>
            <TabsContent value="new">
                <ReceiptForm />
            </TabsContent>
        </Tabs>
    );
}
