
import { redirect } from 'next/navigation';

export default function Page({ params }: { params: { docId: string } }) {
  redirect(`/app/office/documents/quotation/new?editDocId=${params.docId}`);
}
