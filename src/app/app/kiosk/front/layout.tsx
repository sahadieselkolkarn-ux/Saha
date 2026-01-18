"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { DEPARTMENTS } from '@/lib/constants';

const KIOSK_DEPARTMENTS: Array<typeof DEPARTMENTS[number]> = ["CAR_SERVICE", "COMMONRAIL", "MECHANIC", "OUTSOURCE"];

export default function KioskFrontLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const hasAccess = !loading && profile && (
    profile.department === 'MANAGEMENT' || 
    KIOSK_DEPARTMENTS.includes(profile.department as any)
  );

  useEffect(() => {
    if (!loading && !hasAccess) {
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
