"use client";

import type { ReactNode } from "react";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { AuthProvider } from "@/context/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <FirebaseClientProvider>
      <AuthProvider>{children}</AuthProvider>
    </FirebaseClientProvider>
  );
}
