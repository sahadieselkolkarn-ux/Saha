import type { ReactNode } from "react";
import { AppShellClient } from "@/components/app-shell-client";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShellClient>{children}</AppShellClient>;
}
