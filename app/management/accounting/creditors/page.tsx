import { redirect } from 'next/navigation';

export default function ManagementAccountingCreditorsPage() {
  redirect('/app/management/accounting/receivables-payables?tab=creditors');
}
