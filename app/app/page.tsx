
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";

export default function AppRoutingPage() {
  const { profile, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Wait until authentication state is determined
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    if (profile) {
      if (profile.status !== "ACTIVE") {
        router.replace("/pending");
        return;
      }

      const { role, department } = profile;

      if (role === "ADMIN" || department === "MANAGEMENT") {
        router.replace("/management/dashboard");
      } else if (department === "OFFICE") {
        router.replace("/office/intake");
      } else if (department === "COMMONRAIL") {
        router.replace("/commonrail/jobs/all");
      } else if (department === "MECHANIC") {
        router.replace("/mechanic/jobs/all");
      } else if (department === "CAR_SERVICE") {
        router.replace("/car-service/jobs/all");
      } else {
        // Fallback for any other case, e.g., a worker without a valid department
        router.replace("/pending");
      }
    }
    // If profile is not yet available but user is logged in, this effect will re-run when it is.
  }, [profile, user, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-4 text-muted-foreground">Routing to your dashboard...</p>
    </div>
  );
}
