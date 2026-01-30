import './globals.css';
import type { ReactNode } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "Sahadiesel System",
  description: "Sahadiesel Service Management System",
  manifest: "/manifest.json",
  icons: {
    apple: "/icon-192x192.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
       <head>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="application-name" content="Sahadiesel System" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Saha" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#2A9D8F" />
        <link rel="apple-touch-icon" href="/icon-192x192.png"></link>
      </head>
      <body>
        <Providers>
          <AppShellClient>{children}</AppShellClient>
        </Providers>
      </body>
    </html>
  );
}
