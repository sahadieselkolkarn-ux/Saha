import { redirect } from 'next/navigation';

export default function ManagementAccountingExpensesPage() {
  redirect('/app/management/accounting/cashbook?tab=out');
}
