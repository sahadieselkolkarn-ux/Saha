
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
                <div className="flex items-center gap-2">
                     <Button asChild>
                        <Link href="/app/office/documents/quotation/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            สร้างใบเสนอราคาใหม่
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <DocumentList
                docType="QUOTATION"
            />
        </>
    );
}
