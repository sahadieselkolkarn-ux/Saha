
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeTaxInvoicePage() {
    return (
        <>
            <PageHeader title="ใบกำกับภาษี" description="สร้างและจัดการใบกำกับภาษี">
                <Button asChild>
                    <Link href="/app/office/jobs/management/done">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Invoice from Job
                    </Link>
                </Button>
            </PageHeader>
            <DocumentList
                docType="TAX_INVOICE"
            />
        </>
    );
}
