
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import DeliveryNoteForm from '@/components/delivery-note-form';
import { Loader2 } from 'lucide-react';

function NewDeliveryNotePageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  return (
    <>
      <PageHeader title="สร้างใบส่งของ" description="กรอกรายละเอียดเพื่อสร้างใบส่งของใหม่" />
      <DeliveryNoteForm jobId={jobId} />
    </>
  );
}

export default function NewDeliveryNotePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>}>
      <NewDeliveryNotePageContent />
    </Suspense>
  );
}
