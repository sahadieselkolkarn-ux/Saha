import { RequireDepartment } from "@/components/require-department";

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['OFFICE', 'MANAGEMENT']}>{children}</RequireDepartment>;
}
