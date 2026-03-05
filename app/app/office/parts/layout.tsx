
import { RequireDepartment } from "@/components/require-department";

export default function OfficePartsLayout({ children }: { children: React.ReactNode }) {
  // Only allow Purchasing department here (plus Admins/Managers via RequireDepartment)
  return <RequireDepartment allow={['PURCHASING']}>{children}</RequireDepartment>;
}
