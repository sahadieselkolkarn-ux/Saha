import { RequireDepartment } from "@/components/require-department";

export default function CommonrailLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['COMMONRAIL']}>{children}</RequireDepartment>;
}
