import { RequireDepartment } from "@/components/require-department";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  // Allow Management and Accounting/HR departments to access HR module
  return <RequireDepartment allow={["MANAGEMENT", "ACCOUNTING_HR"]}>{children}</RequireDepartment>;
}
