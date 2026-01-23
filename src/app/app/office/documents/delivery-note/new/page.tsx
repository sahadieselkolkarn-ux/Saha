
"use client";

import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loader2 } from 'lucide-react';
import DeliveryNoteForm from '@/components/delivery-note-form';

export default function NewDeliveryNotePage() {
  return (
    <>
      <PageHeader title="สร้างใบส่งของ" description="กรอกรายละเอียดเพื่อสร้างใบส่งของใหม่" />
      <Suspense fallback={<div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <DeliveryNoteForm />
      </Suspense>
    </>
  );
}
