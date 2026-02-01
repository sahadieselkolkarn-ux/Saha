import { redirect } from "next/navigation";

export default function Page({ params }: { params: { receiptId: string } }) {
  redirect(`/app/management/accounting/documents/receipt/${params.receiptId}/confirm`);
}
