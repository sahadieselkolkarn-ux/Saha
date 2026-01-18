"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // No user, send to login.
        router.replace('/login');
      } else if (profile) {
        // User and profile exist, redirect based on status.
        if (profile.status === 'ACTIVE') {
          router.replace('/app/jobs');
        } else {
          router.replace('/pending');
        }
      } else {
        // User exists but profile is null (e.g., failed signup).
        // Send back to login to prevent getting stuck.
        console.error("Authenticated user has no profile. Redirecting to login.");
        router.replace('/login');
      }
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}
