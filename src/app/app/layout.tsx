"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return; // Wait until loading is false
    if (!user) {
      router.replace('/login');
    }
  }, [user, loading, router]);
  
  // Effect to remove scroll lock on navigation, as a safeguard against stuck dialogs.
  useEffect(() => {
    document.documentElement.classList.remove('prevent-scroll');
    document.body.style.overflow = '';
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user is logged in, show the app regardless of role, status, etc.
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
