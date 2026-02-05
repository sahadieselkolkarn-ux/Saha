"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function ManagementBillingNotesPage() {
    return (
        <>
            <PageHeader title="ใบวางบิล" description="ค้นหาและจัดการใบวางบิลทั้งหมด">
                <Button asChild>
                    <Link href="/app/management/accounting/documents/billing-note/batch">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        สร้างใบวางบิล (สรุปทั้งเดือน)
                    </Link>
                </Button>
            </PageHeader>
            <DocumentList
                docType="BILLING_NOTE"
                baseContext="accounting"
            />
        </>
    );
}
