'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';

export default function AppRedirectPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profile) {
      return;
    }

    const { role, department } = profile;

    if (role === 'ADMIN') {
      router.replace('/app/jobs');
      return;
    }

    if (role === 'OFFICER') {
      if (department === 'CAR_SERVICE') {
        router.replace('/app/car-service/jobs/all');
      } else {
        router.replace('/app/kiosk');
      }
      return;
    }

    if (role === 'MANAGER' || role === 'WORKER') {
      switch (department) {
        case 'MANAGEMENT':
          router.replace('/app/management/overview');
          break;
        case 'OFFICE':
          router.replace('/app/office/intake');
          break;
        case 'CAR_SERVICE':
          router.replace('/app/car-service/jobs/all');
          break;
        case 'COMMONRAIL':
          router.replace('/app/commonrail/jobs/all');
          break;
        case 'MECHANIC':
          router.replace('/app/mechanic/jobs/all');
          break;
        case 'OUTSOURCE':
          router.replace('/app/outsource/export/new');
          break;
        default:
          router.replace('/app/jobs');
          break;
      }
      return;
    }

    router.replace('/app/jobs');

  }, [profile, loading, router]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p>Redirecting you to the correct page...</p>
    </div>
  );
}
