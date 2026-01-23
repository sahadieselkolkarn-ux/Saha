
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeDeliveryNotePage() {
  return (
    <>
      <PageHeader title="ใบส่งสินค้า" description="ค้นหาและจัดการใบส่งสินค้า">
        <Button asChild>
          <Link href="/app/office/documents/delivery-note/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Delivery Note
          </Link>
        </Button>
      </PageHeader>
      <DocumentList
        docType="DELIVERY_NOTE"
      />
    </>
  );
}
