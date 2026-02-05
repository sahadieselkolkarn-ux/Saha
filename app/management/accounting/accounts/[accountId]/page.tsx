import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  // Redirect to the canonical URL under the /app prefix
  redirect(`/app/management/accounting/accounts/${accountId}`);
}
