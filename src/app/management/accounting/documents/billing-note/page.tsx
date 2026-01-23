
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
        <Button asChild>
          <Link href="/app/management/accounting/documents/billing-note/new">
            <PlusCircle /> New Billing Note
          </Link>
        </Button>
      </PageHeader>
      <DocumentList docType="BILLING_NOTE" />
    </>
  );
}
