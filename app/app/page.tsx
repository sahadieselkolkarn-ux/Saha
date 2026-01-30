
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
    if (!profile) return;

    if (profile.status && profile.status !== "ACTIVE") { router.replace("/pending"); return; }

    const dept = profile.department;
    const role = profile.role;

    if (role === "ADMIN" || dept === "MANAGEMENT") router.replace("/management/dashboard");
    else if (dept === "OFFICE") router.replace("/office/customers");
    else if (dept === "COMMONRAIL") router.replace("/commonrail/jobs/all");
    else if (dept === "MECHANIC") router.replace("/mechanic/jobs/all");
    else if (dept === "CAR_SERVICE") router.replace("/car-service/jobs/all");
    else router.replace("/pending");
  }, [loading, user, profile, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin" />
    </div>
  );
}
