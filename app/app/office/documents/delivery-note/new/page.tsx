
"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import DeliveryNoteForm from '@/components/delivery-note-form';
import { Loader2 } from 'lucide-react';

function NewDeliveryNotePageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const editDocId = searchParams.get("editDocId");

  const title = editDocId ? "แก้ไขใบส่งของชั่วคราว" : "สร้างใบส่งของชั่วคราว";
  const description = editDocId
    ? "แก้ไขรายละเอียดของเอกสารและบันทึก"
    : "กรอกรายละเอียดเพื่อสร้างใบส่งของชั่วคราวใหม่";

  return (
    <>
      <PageHeader title={title} description={description} />
      <DeliveryNoteForm jobId={jobId} editDocId={editDocId} />
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
