"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { ReceiptForm } from "@/components/receipt-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

function ReceiptPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    
    // Check if we should be in the "new" tab (e.g. for editing or creating from a job)
    const hasEditId = !!searchParams.get('editDocId');
    const hasSourceId = !!searchParams.get('sourceDocId');
    const defaultTab = (hasEditId || hasSourceId || searchParams.get('tab') === 'new') ? 'new' : 'list';
    
    const [activeTab, setActiveTab] = useState(defaultTab);

    // Sync state if URL changes (e.g. user clicks edit on another item)
    useEffect(() => {
        if (hasEditId || hasSourceId || searchParams.get('tab') === 'new') {
            setActiveTab('new');
        } else {
            setActiveTab('list');
        }
    }, [hasEditId, hasSourceId, searchParams]);

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <PageHeader title="ใบเสร็จรับเงิน" description="สร้างและจัดการใบเสร็จรับเงินสำหรับรายการขาย">
                <TabsList className="grid w-full max-w-[400px] grid-cols-2">
                    <TabsTrigger value="list">รายการทั้งหมด</TabsTrigger>
                    <TabsTrigger value="new">{hasEditId ? 'แก้ไขใบเสร็จ' : 'สร้างใหม่'}</TabsTrigger>
                </TabsList>
            </PageHeader>
            
            <TabsContent value="list" className="mt-0">
                <DocumentList
                    docType="RECEIPT"
                    baseContext="accounting"
                />
            </TabsContent>
            
            <TabsContent value="new" className="mt-0">
                <ReceiptForm />
            </TabsContent>
        </Tabs>
    );
}

export default function ManagementReceiptsPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>}>
            <ReceiptPageContent />
        </Suspense>
    );
}
