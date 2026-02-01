
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { CreditNoteForm } from "@/components/credit-note-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ManagementCreditNotesPage() {
  return (
    <Tabs defaultValue="list">
        <PageHeader title="ใบลดหนี้" description="สร้างและจัดการใบลดหนี้">
            <TabsList>
                <TabsTrigger value="list">รายการทั้งหมด</TabsTrigger>
                <TabsTrigger value="new">สร้างใหม่</TabsTrigger>
            </TabsList>
        </PageHeader>
        <TabsContent value="list">
             <DocumentList docType="CREDIT_NOTE" />
        </TabsContent>
        <TabsContent value="new">
            <CreditNoteForm />
        </TabsContent>
    </Tabs>
  );
}
