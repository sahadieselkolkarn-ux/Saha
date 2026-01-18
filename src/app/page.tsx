"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait until we have an auth state

    if (user) {
        if (profile) { // Also wait for profile
            if (profile.status === 'ACTIVE') {
                router.replace('/app/jobs');
            } else if (profile.status === 'PENDING') {
                router.replace('/pending');
            } else {
                router.replace('/login');
            }
        }
    } else {
      router.replace('/login');
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}
