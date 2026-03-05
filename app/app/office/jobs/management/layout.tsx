
import { RequireDepartment } from "@/components/require-department";

export default function OfficeJobManagementLayout({ children }: { children: React.ReactNode }) {
  // Management screens are restricted to Office department
  return <RequireDepartment allow={['OFFICE']}>{children}</RequireDepartment>;
}
