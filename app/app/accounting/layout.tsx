import { RequireDepartment } from "@/components/require-department";

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['MANAGEMENT', 'OFFICE']}>{children}</RequireDepartment>;
}
