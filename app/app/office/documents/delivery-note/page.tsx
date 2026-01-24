
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeDeliveryNotePage() {
  return (
    <>
      <PageHeader title="ใบส่งของชั่วคราว" description="สร้างและจัดการใบส่งของชั่วคราว">
        <Button asChild>
          <Link href="/app/office/documents/delivery-note/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างใบส่งของใหม่
          </Link>
        </Button>
      </PageHeader>
      <DocumentList
        docType="DELIVERY_NOTE"
      />
    </>
  );
}
