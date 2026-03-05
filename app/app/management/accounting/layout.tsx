import { RequireDepartment } from "@/components/require-department";

export default function ManagementAccountingLayout({ children }: { children: React.ReactNode }) {
  // Allow Management and Accounting/HR departments to access accounting module
  return <RequireDepartment allow={["MANAGEMENT", "ACCOUNTING_HR"]}>{children}</RequireDepartment>;
}
