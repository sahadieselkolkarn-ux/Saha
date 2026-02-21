"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";

export default function OfficeDeliveryNotePage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="ใบส่งของชั่วคราว" 
        description="สร้างและจัดการใบส่งของชั่วคราว" 
        className="mb-0"
      />
      
      <div className="flex items-center gap-2">
        <Button asChild>
          <Link href="/app/office/documents/delivery-note/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างใบส่งของใหม่
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/office/jobs/management/done">
            สร้างจากงานซ่อม
          </Link>
        </Button>
      </div>

      <DocumentList
        docType="DELIVERY_NOTE"
        orderByField="docNo"
        orderByDirection="desc"
      />
    </div>
  );
}
