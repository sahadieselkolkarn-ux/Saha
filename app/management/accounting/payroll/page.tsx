import { redirect } from 'next/navigation';

export default function DeprecatedPayrollPage() {
  redirect('/management/hr/payroll');
}
