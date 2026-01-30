import { RequireDepartment } from "@/components/require-department";

export default function MechanicLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['MECHANIC']}>{children}</RequireDepartment>;
}
