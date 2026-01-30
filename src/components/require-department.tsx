"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }
    
    if (!profile) return; // Still loading or profile doesn't exist

    // Admins are always allowed access
    if (profile.role === 'ADMIN') {
      return;
    }

    const userDept = profile.department;
    if (!userDept) {
      router.replace("/pending");
      return;
    }
    
    // Check if user's department is in the allowed list
    if (!allow.includes(userDept)) {
      router.replace("/app"); // Redirect to a safe default page
      return;
    }
  }, [user, profile, loading, router, allow]);

  // Render a loading state while checking
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  // Final check before rendering children
  if (profile.role === 'ADMIN' || (profile.department && allow.includes(profile.department))) {
    return <>{children}</>;
  }

  // Render nothing while redirecting
  return null;
}
