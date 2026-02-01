
"use client";

import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";

export default function ManagementReceiptsPage() {
    return (
        <>
            <PageHeader title="ใบเสร็จรับเงิน" description="ค้นหาและจัดการใบเสร็จรับเงินทั้งหมด" />
            <DocumentList
                docType="RECEIPT"
            />
        </>
    );
}
