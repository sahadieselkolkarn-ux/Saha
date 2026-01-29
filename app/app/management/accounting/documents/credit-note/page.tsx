
"use client";

import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { CreditNoteForm } from '@/components/credit-note-form';
import { Loader2 } from 'lucide-react';

export default function CreditNotePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>}>
        <PageHeader title="ใบลดหนี้" description="สร้างใบลดหนี้อ้างอิงจากบิลภาษี (Tax Invoice)" />
        <CreditNoteForm />
    </Suspense>
  );
}

    