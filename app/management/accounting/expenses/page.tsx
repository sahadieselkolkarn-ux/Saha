import { redirect } from 'next/navigation';

export default function ManagementAccountingExpensesPage() {
  redirect('/management/accounting/cashbook?tab=out');
}
