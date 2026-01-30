
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function ManagementDashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!profile) {
      router.replace('/login');
      return;
    }
    const isAllowed = profile.role === 'ADMIN' || profile.department === 'MANAGEMENT';
    if (!isAllowed) {
      router.replace('/app');
    }
  }, [profile, loading, router]);

  const isAllowed = profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT';

  if (loading || !profile || !isAllowed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <PageHeader title="Dashboard" description="An overview of your business activities." />
  );
}
