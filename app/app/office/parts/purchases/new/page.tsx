
"use client";

import { PageHeader } from "@/components/page-header";
import { PurchaseDocForm } from "@/components/purchase-doc-form";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function NewPurchasePage() {
    return (
        <>
            <PageHeader title="สร้างรายการซื้อ" description="บันทึกบิล/ใบส่งของที่ได้รับจากร้านค้า" />
            <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}>
                <PurchaseDocForm />
            </Suspense>
        </>
    );
}
