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
    // This effect handles redirection logic once loading is complete.
    if (!loading) {
      if (!user) {
        // If there's no user, they are not logged in and must go to login.
        router.replace('/login');
      } else if (!profile) {
        // User is authenticated but profile data is missing.
        // This could be a new user whose profile doc hasn't been created,
        // or an error state. Send them to a safe page.
        console.error("Authenticated user has no profile data. Redirecting to login.");
        router.replace('/login');
      } else if (profile.status !== 'ACTIVE') {
        // Profile exists but is not active (e.g., PENDING, SUSPENDED).
        router.replace('/pending');
      }
    }
  }, [user, profile, loading, router]);

  // This conditional rendering is the primary guard.
  // It prevents any of the child components (the actual app pages) from
  // rendering until we have confirmed the user is loaded, has a profile,
  // and is active. This is critical to prevent pages from making
  // unauthenticated Firestore requests.
  if (loading || !user || !profile || profile.status !== 'ACTIVE') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Only when all checks pass, render the app shell and its children.
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
