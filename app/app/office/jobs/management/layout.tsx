
import { RequireDepartment } from "@/components/require-department";

export default function OfficeJobManagementLayout({ children }: { children: React.ReactNode }) {
  // Management screens are accessible by Office, Purchasing, and Accounting/HR departments
  return <RequireDepartment allow={['OFFICE', 'PURCHASING', 'ACCOUNTING_HR']}>{children}</RequireDepartment>;
}
