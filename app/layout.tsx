import type { ReactNode } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { Providers } from "@/components/providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Providers>
          <AppShellClient>{children}</AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
