import type { ReactNode } from "react";
import { AppShellClient } from "@/components/app-shell-client";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        <AppShellClient>{children}</AppShellClient>
      </body>
    </html>
  );
}
