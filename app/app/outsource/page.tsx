
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

export default function OutsourceRootPage() {
  const { profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (profile?.role === 'WORKER') {
      router.replace('/app/outsource/jobs/my');
    } else {
      router.replace('/app/outsource/tracking/pending');
    }
  }, [profile, router]);

  return null;
}
