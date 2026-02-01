
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';

export default function AppHomePage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!profile) {
      // This case should be handled by the main layout, but as a fallback
      router.replace('/login');
      return;
    }

    const { role, department } = profile;

    if (role === 'ADMIN' || department === 'MANAGEMENT' || role === 'MANAGER') {
      router.replace('/app/management/dashboard');
      return;
    }

    if (role === 'OFFICER' && department === 'CAR_SERVICE') {
      router.replace('/app/kiosk');
      return;
    }

    // Redirect based on department for other roles
    switch (department) {
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
        router.replace('/app/outsource/tracking/pending');
        break;
      default:
        // Fallback for workers without a specific landing page or if department is not set
        router.replace('/app/jobs');
        break;
    }
  }, [profile, loading, router]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
