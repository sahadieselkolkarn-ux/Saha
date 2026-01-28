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
      router.replace('/jobs');
      return;
    }

    if (role === 'OFFICER') {
      if (department === 'CAR_SERVICE') {
        router.replace('/car-service/jobs/all');
      } else {
        router.replace('/kiosk');
      }
      return;
    }

    if (role === 'MANAGER' || role === 'WORKER') {
      switch (department) {
        case 'MANAGEMENT':
          router.replace('/management/overview');
          break;
        case 'OFFICE':
          router.replace('/office/intake');
          break;
        case 'CAR_SERVICE':
          router.replace('/car-service/jobs/all');
          break;
        case 'COMMONRAIL':
          router.replace('/commonrail/jobs/all');
          break;
        case 'MECHANIC':
          router.replace('/mechanic/jobs/all');
          break;
        case 'OUTSOURCE':
          router.replace('/outsource/export/new');
          break;
        default:
          router.replace('/jobs');
          break;
      }
      return;
    }

    router.replace('/jobs');

  }, [profile, loading, router]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p>Redirecting you to the correct page...</p>
    </div>
  );
}
