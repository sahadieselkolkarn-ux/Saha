import { RequireDepartment } from "@/components/require-department";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={[]}>{children}</RequireDepartment>;
}
