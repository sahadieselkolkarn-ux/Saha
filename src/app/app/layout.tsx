"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || !profile) {
        // If no authenticated user or no profile document, redirect to login.
        router.replace('/login');
      } else if (profile.status !== 'ACTIVE') {
        // If profile exists but is not active, redirect to pending page.
        router.replace('/pending');
      }
    }
  }, [user, profile, loading, router]);

  if (loading || !profile || profile.status !== 'ACTIVE') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

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
