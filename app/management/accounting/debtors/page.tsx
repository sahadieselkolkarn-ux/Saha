import { redirect } from 'next/navigation';

export default function ManagementAccountingDebtorsPage() {
  redirect('/management/accounting/receivables-payables?tab=debtors');
}
