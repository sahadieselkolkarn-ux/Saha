
import { RequireDepartment } from "@/components/require-department";

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  // Intake is restricted to Office department
  return <RequireDepartment allow={['OFFICE']}>{children}</RequireDepartment>;
}
