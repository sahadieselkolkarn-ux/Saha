import { redirect } from 'next/navigation';

export default function ManagementAccountingDebtorsPage() {
  redirect('/app/management/accounting/receivables-payables?tab=debtors');
}
