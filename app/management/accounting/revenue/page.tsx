import { redirect } from 'next/navigation';

export default function ManagementAccountingRevenuePage() {
  redirect('/management/accounting/cashbook?tab=in');
}
