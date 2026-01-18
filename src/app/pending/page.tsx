"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "firebase/auth";
import { Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PendingPage() {
  const { profile, loading, auth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.status === "ACTIVE") {
      router.replace("/app/jobs");
    }
  }, [profile, loading, router]);
  
  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-primary/10 text-primary p-3 rounded-full mb-4">
            <Hourglass className="h-10 w-10" />
          </div>
          <CardTitle className="font-headline text-2xl">Account Pending Approval</CardTitle>
          <CardDescription>
            Your account has been successfully created. An administrator will review and approve your account shortly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            If you have any questions, please contact support.
          </p>
        </CardContent>
        <CardFooter>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
                Logout
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
