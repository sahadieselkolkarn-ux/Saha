"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, LayoutTemplate } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeQuotationPage() {
    return (
        <>
            <PageHeader title="ใบเสนอราคา" description="ค้นหาและจัดการใบเสนอราคาทั้งหมด">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/app/office/documents/quotation/templates">
                            <LayoutTemplate className="mr-2 h-4 w-4" />
                            จัดการ Template
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/app/office/jobs/management/quotation">
                            สร้างจากงานซ่อม
                        </Link>
                    </Button>
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
