
"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";

export function RequireDepartment({
  allow,
  children,
}: {
  allow: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  // Stable allow check to prevent excessive hook cycles
  const allowKey = useMemo(() => allow.join(','), [allow]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }
    
    if (!profile) return;

    // Admins and Managers are always allowed access to any department-restricted area
    if (profile.role === 'ADMIN' || profile.role === 'MANAGER') {
      return;
    }

    const userDept = profile.department;
    if (!userDept) {
      router.replace("/pending");
      return;
    }
    
    // Check if user's department is in the allowed list
    if (!allow.includes(userDept)) {
      router.replace("/app");
      return;
    }
  }, [user, profile, loading, router, allowKey]);

  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  // Final check before rendering children
  if (profile.role === 'ADMIN' || profile.role === 'MANAGER' || (profile.department && allow.includes(profile.department))) {
    return <>{children}</>;
  }

  return null;
}
