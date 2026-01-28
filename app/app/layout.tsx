
"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";
import { FixStuckUI } from "@/components/fix-stuck-ui";
import { AppHeader } from "@/components/app-header";

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const isPrintMode = searchParams.get('print') === '1';

  useEffect(() => {
    if (loading) return; // Wait until loading is false
    if (!user) {
      router.replace('/login');
    } else if (profile?.status && profile.status !== 'ACTIVE') {
      router.replace('/pending');
    }
  }, [user, profile, loading, router]);
  
  if (loading || !user || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (profile.status !== 'ACTIVE') {
    // This will be handled by the useEffect redirect, but this is a fallback.
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
        <main className="min-h-screen w-full p-0">
            {children}
        </main>
      </>
    );
  }

  // If user is logged in, show the app regardless of role, status, etc.
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        }>
            <AppLayoutContent>{children}</AppLayoutContent>
        </Suspense>
    );
}
