
"use client";

import { PageHeader } from '@/components/page-header';
import DeliveryNoteForm from '@/components/delivery-note-form';

export default function NewDeliveryNotePage() {
  return (
    <>
      <PageHeader title="สร้างใบส่งของ" description="กรอกรายละเอียดเพื่อสร้างใบส่งของใหม่" />
      <DeliveryNoteForm />
    </>
  );
}
