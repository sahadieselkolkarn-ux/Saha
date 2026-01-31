"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";

export default function PostLoginRouter() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!profile) return; // Still loading or missing profile

    if (profile.status && profile.status !== "ACTIVE") { router.replace("/pending"); return; }

    const dept = profile.department;
    const role = profile.role;

    if (role === "ADMIN" || dept === "MANAGEMENT") {
        router.replace("/management/dashboard");
        return;
    }
    
    switch(dept) {
        case "OFFICE":
            router.replace("/app/office/intake");
            break;
        case "CAR_SERVICE":
            router.replace("/app/car-service/jobs/all");
            break;
        case "COMMONRAIL":
            router.replace("/app/commonrail/jobs/all");
            break;
        case "MECHANIC":
            router.replace("/app/mechanic/jobs/all");
            break;
        case "OUTSOURCE":
            router.replace("/app/outsource/tracking/pending");
            break;
        default:
            router.replace("/pending");
    }
  }, [loading, user, profile, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin" />
    </div>
  );
}
