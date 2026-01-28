
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function PendingPage() {
  const { signOut, user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait until auth & profile status is determined

    if (!user) {
      // If user is logged out for any reason, go to login page
      router.replace("/login");
      return;
    }
    
    // If profile is loaded and the status is now ACTIVE, redirect to the app
    if (profile?.status === "ACTIVE") {
      router.replace("/app");
    }
  }, [user, profile, loading, router]);

  // Show a loading spinner while we determine the auth/profile state
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If the user's status is PENDING, show the pending message
  if (profile.status === 'PENDING') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Account Pending</CardTitle>
            <CardDescription>
              Your account is currently awaiting activation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-6 text-sm text-muted-foreground">
              Please contact an administrator to activate your account. You will
              be able to log in once your account is active.
            </p>
            <Button variant="outline" onClick={signOut}>
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Fallback for other non-active statuses like SUSPENDED
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle className="text-2xl font-headline">Account Issue</CardTitle>
                <CardDescription>
                    Your account status is: {profile.status}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="mb-6 text-sm text-muted-foreground">
                    Please contact an administrator for assistance.
                </p>
                <Button variant="outline" onClick={signOut}>
                    Logout
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
