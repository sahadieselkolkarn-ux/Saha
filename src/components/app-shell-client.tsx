"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { FixStuckUI } from "@/components/fix-stuck-ui";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

function FullscreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const isPrintMode = searchParams.get("print") === "1";

  // ✅ Public routes: allow rendering without auth + without sidebar wrapper
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/pending" ||
    pathname === "/signup" ||
    pathname === "/healthz";

  // ✅ Public pages render directly (no auth gating, no sidebar)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // ✅ Redirect logic for protected routes only
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    // wait until profile loaded
    if (!profile) return;

    if (profile.status && profile.status !== "ACTIVE") {
      router.replace("/pending");
    }
  }, [loading, user, profile, router]);

  // ✅ Show spinner while bootstrapping auth/profile for protected pages
  if (loading || !user || !profile) {
    return <FullscreenSpinner />;
  }

  if (profile.status !== "ACTIVE") {
    return <FullscreenSpinner />;
  }

  // ✅ Print mode: no sidebar/header
  if (isPrintMode) {
    return (
      <>
        <FixStuckUI />
        <main className="min-h-screen w-full p-0">{children}</main>
      </>
    );
  }

  // ✅ Normal app shell
  return (
    <>
      <FixStuckUI />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col sm:pl-64 overflow-hidden">
          <AppHeader />
          <main className="flex-1 p-4 md:p-8 lg:p-10 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export function AppShellClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullscreenSpinner />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
