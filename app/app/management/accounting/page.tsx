import { redirect } from 'next/navigation';

export default function ManagementAccountingPage() {
  // Redirect directly to the canonical Cashbook page
  redirect('/app/management/accounting/cashbook?tab=in');
}
