import React from 'react';
import { redirect } from "next/navigation";

export default function Page({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = React.use(params);
  redirect(`/app/management/accounting/documents/receipt/${receiptId}/confirm`);
}
