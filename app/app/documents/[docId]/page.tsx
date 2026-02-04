"use client";

import { useEffect, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { Document as DocumentType } from "@/lib/types";

function RouterInner() {
  const { docId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { db } = useFirebase();

  const docRef = useMemo(() => (db && typeof docId === 'string' ? doc(db, 'documents', docId) : null), [db, docId]);
  const { data: document, isLoading, error } = useDoc<DocumentType>(docRef);

  useEffect(() => {
    if (document && !isLoading) {
      const type = document.docType;
      
      // Preserve existing query parameters but remove editDocId to prevent conflicts if we're adding it
      const params = new URLSearchParams(searchParams.toString());
      params.delete('editDocId');
      const extraParams = params.toString() ? `&${params.toString()}` : "";
      const baseParams = params.toString() ? `?${params.toString()}` : "";
      
      switch (type) {
        case 'QUOTATION':
          router.replace(`/app/office/documents/quotation/new?editDocId=${document.id}${extraParams}`);
          break;
        case 'DELIVERY_NOTE':
          router.replace(`/app/office/documents/delivery-note/new?editDocId=${document.id}${extraParams}`);
          break;
        case 'TAX_INVOICE':
          router.replace(`/app/office/documents/tax-invoice/new?editDocId=${document.id}${extraParams}`);
          break;
        case 'BILLING_NOTE':
          router.replace(`/app/management/accounting/documents/billing-note${baseParams}`);
          break;
        case 'RECEIPT':
          // If not confirmed, go to confirmation UI. If confirmed, go to list (or viewer if added later)
          if (document.receiptStatus !== 'CONFIRMED') {
            router.replace(`/app/management/accounting/documents/receipt/${document.id}/confirm${baseParams}`);
          } else {
            router.replace(`/app/management/accounting/documents/receipt${baseParams}`);
          }
          break;
        case 'WITHHOLDING_TAX':
          router.replace(`/app/management/accounting/documents/withholding-tax${baseParams}`);
          break;
        case 'CREDIT_NOTE':
          router.replace(`/app/management/accounting/documents/credit-note${baseParams}`);
          break;
        default:
          // Keep showing the type error if unknown
          break;
      }
    }
  }, [document, isLoading, router, searchParams]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm font-medium">กำลังค้นหาเอกสาร...</p>
      </div>
    );
  }

  if (error || (document === null && !isLoading)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <PageHeader title="ไม่พบเอกสาร" description="เอกสารที่ต้องการอาจถูกลบหรือไม่มีอยู่ในระบบ" />
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
        </Button>
      </div>
    );
  }

  if (document && !['QUOTATION', 'DELIVERY_NOTE', 'TAX_INVOICE', 'BILLING_NOTE', 'RECEIPT', 'WITHHOLDING_TAX', 'CREDIT_NOTE'].includes(document.docType)) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500" />
            <PageHeader title="ประเภทเอกสารไม่รองรับ" description={`ไม่รู้จักประเภทเอกสาร: ${document.docType}`} />
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
            </Button>
        </div>
      )
  }

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm font-medium">กำลังนำทางไปยังเอกสาร...</p>
    </div>
  );
}

export default function CentralDocumentRouterPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin"/></div>}>
            <RouterInner />
        </Suspense>
    )
}
