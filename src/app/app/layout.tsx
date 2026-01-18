"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait until loading is false
    if (!user) {
      router.replace('/login');
    } else if (user && !profile) {
      // Still waiting for profile, might be a delay or an error. Loader is shown.
    } else if (profile?.status === 'PENDING') {
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
  
  if (profile.status === 'INACTIVE') {
      // This could be a page saying the account is inactive
      router.replace('/login');
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <p>Your account is inactive.</p>
        </div>
      );
  }

  if (profile.status === 'ACTIVE') {
    return (
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex flex-1 flex-col sm:pl-64">
          <div className="flex-1 p-4 md:p-8 lg:p-10">
            {children}
          </div>
        </main>
      </div>
    );
  }

  // Fallback, should not be reached if logic is correct
  return null;
}
