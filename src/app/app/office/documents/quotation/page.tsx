
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeQuotationPage() {
    return (
        <>
            <PageHeader title="ใบเสนอราคา" description="ค้นหาและจัดการใบเสนอราคาทั้งหมด">
                <Button asChild>
                    <Link href="/app/office/jobs/management/quotation">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Quotation from Job
                    </Link>
                </Button>
            </PageHeader>
            <DocumentList
                docType="QUOTATION"
            />
        </>
    );
}
