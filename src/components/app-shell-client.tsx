"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { FixStuckUI } from "@/components/fix-stuck-ui";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isPrintMode = searchParams.get("print") === "1";

  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/pending" ||
    pathname === "/healthz";

  useEffect(() => {
    if (loading || isPublicRoute) return;

    if (!user) {
      router.replace("/login");
    } else if (profile?.status && profile.status !== "ACTIVE") {
      router.replace("/pending");
    }
  }, [user, profile, loading, router, isPublicRoute, pathname]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading || !user || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (profile.status !== "ACTIVE") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (isPrintMode) {
    return (
      <>
        <FixStuckUI />
        <main className="min-h-screen w-full p-0">{children}</main>
      </>
    );
  }

  return (
    <>
      <FixStuckUI />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col sm:pl-64 overflow-hidden">
          <AppHeader />
          <main className="flex-1 p-4 md:p-8 lg:p-10 overflow-y-auto">{children}</main>
        </div>
      </div>
    </>
  );
}

export function AppShellClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      }
    >
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
