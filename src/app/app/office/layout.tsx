"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  // Access is granted to MANAGEMENT or OFFICE departments.
  const hasAccess = !loading && profile && (profile.department === 'MANAGEMENT' || profile.department === 'OFFICE');

  useEffect(() => {
    if (!loading && !hasAccess) {
      // If no access, redirect to a default page like the jobs list.
      router.replace('/app/jobs');
    }
  }, [loading, hasAccess, router]);

  if (loading || !profile || !hasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  return <>{children}</>;
}
