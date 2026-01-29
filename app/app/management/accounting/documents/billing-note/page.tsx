
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

export default function BillingNotePage() {
  return (
     <>
      <PageHeader title="ใบวางบิล" description="สร้างและจัดการใบวางบิล">
         <div className="flex items-center gap-2">
            <Button asChild>
                <Link href="/app/management/accounting/documents/billing-note/batch">
                    สรุปยอดทั้งเดือน
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/app/management/accounting/documents/billing-note/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    สร้างใบวางบิล
                </Link>
            </Button>
        </div>
      </PageHeader>
      <DocumentList docType="BILLING_NOTE" />
    </>
  );
}
