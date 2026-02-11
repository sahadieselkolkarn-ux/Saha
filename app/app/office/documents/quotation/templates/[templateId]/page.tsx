"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { doc } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { QuotationTemplateForm } from "@/components/quotation-template-form";
import { Loader2 } from "lucide-react";
import type { QuotationTemplate } from "@/lib/types";

export default function EditQuotationTemplatePage() {
  const { templateId } = useParams();
  const { db } = useFirebase();

  const templateRef = useMemo(() => db && typeof templateId === 'string' ? doc(db, "quotationTemplates", templateId) : null, [db, templateId]);
  const { data: template, isLoading } = useDoc<QuotationTemplate>(templateRef);

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;
  if (!template) return <PageHeader title="ไม่พบ Template" />;

  return (
    <>
      <PageHeader title="แก้ไข Template" description={`กำลังแก้ไข: ${template.name}`} />
      <QuotationTemplateForm editTemplate={template} />
    </>
  );
}
