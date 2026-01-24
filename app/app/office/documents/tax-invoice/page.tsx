
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
                <div className="flex items-center gap-2">
                    <Button asChild>
                        <Link href="/app/office/documents/tax-invoice/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            สร้างใบกำกับภาษีใหม่
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/app/office/jobs/management/done">
                            สร้างจากงานซ่อม
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <DocumentList
                docType="TAX_INVOICE"
            />
        </>
    );
}
