
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

  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/pending" ||
    pathname === "/signup" ||
    pathname === "/healthz";

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV !== "production") {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
            console.log('Development mode: SW unregistered to prevent caching issues.');
          }
        });
        return;
      }

      // In production, register the service worker
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
          // Check for updates on load to fetch the latest version
          registration.update();
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  }, []);

  useEffect(() => {
    // Don't run auth logic while loading
    if (loading) return;

    if (!user) {
      // If not logged in and trying to access a protected route
      if (!isPublicRoute) {
        router.replace("/login");
      }
      return;
    }

    // If logged in but on a public route (except /pending), redirect to home
    if (isPublicRoute && pathname !== "/pending") {
        if (profile?.status === "ACTIVE") {
            router.replace("/app");
        } else if (profile) {
            router.replace("/pending");
        }
        return;
    }

    // For protected routes, if profile is missing or not active, go to /pending
    if (!isPublicRoute) {
        if (!profile || (profile.status && profile.status !== "ACTIVE")) {
            if (pathname !== "/pending") {
                router.replace("/pending");
            }
        }
    }
  }, [loading, user, profile, router, pathname, isPublicRoute]);

  // Public pages render directly without the app shell.
  if (isPublicRoute) {
    return <>{children}</>;
  }
  
  // For protected routes, show a spinner while we determine auth/profile state.
  // We allow /pending to render through the spinner check if we have a user
  if (loading || !user || (!profile && pathname !== "/pending")) {
    return <FullscreenSpinner />;
  }
  
  // Special case: if we have a user but no profile doc yet, allow /pending to show the fallback card
  if (!profile && pathname === "/pending") {
      return <div className="p-4">{children}</div>;
  }

  // If status is not active, redirect to pending (already handled by useEffect, but for safety)
  if (profile && profile.status !== "ACTIVE" && pathname !== "/pending") {
      return <FullscreenSpinner />;
  }
  
  const isPrintMode = searchParams.get("print") === "1";
  if (isPrintMode) {
    return (
      <>
        <FixStuckUI />
        <main className="min-h-screen w-full p-0">{children}</main>
      </>
    );
  }

  // Render the full app shell for authenticated, active users.
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
