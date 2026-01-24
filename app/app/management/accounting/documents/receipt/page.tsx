
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

export default function ReceiptPage() {
  return (
     <>
      <PageHeader title="ใบเสร็จรับเงิน" description="สร้างและจัดการใบเสร็จรับเงิน">
         <Button asChild>
          <Link href="/app/management/accounting/documents/receipt/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างใบเสร็จรับเงินใหม่
          </Link>
        </Button>
      </PageHeader>
      <DocumentList docType="RECEIPT" />
    </>
  );
}
