import { RequireDepartment } from "@/components/require-department";

export default function OutsourceLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['OUTSOURCE']}>{children}</RequireDepartment>;
}
