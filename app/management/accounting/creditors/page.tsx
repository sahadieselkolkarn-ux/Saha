import { redirect } from 'next/navigation';

export default function ManagementAccountingCreditorsPage() {
  redirect('/management/accounting/receivables-payables?tab=creditors');
}
