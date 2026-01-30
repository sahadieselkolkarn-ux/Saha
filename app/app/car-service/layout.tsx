import { RequireDepartment } from "@/components/require-department";

export default function CarServiceLayout({ children }: { children: React.ReactNode }) {
  return <RequireDepartment allow={['CAR_SERVICE']}>{children}</RequireDepartment>;
}
