import { redirect } from 'next/navigation';

export default function ManagementAccountingRevenuePage() {
  redirect('/app/management/accounting/cashbook?tab=in');
}
