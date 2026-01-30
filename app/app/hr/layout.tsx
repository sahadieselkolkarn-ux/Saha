import { RequireDepartment } from "@/components/require-department";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={["MANAGEMENT"]}>{children}</RequireDepartment>;
}
