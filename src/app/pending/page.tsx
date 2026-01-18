"use client";

import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function PendingPage() {
    const { signOut, user } = useAuth();
    
    if (!user) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        )
    }

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
                        Please contact an administrator to activate your account. You will be able to log in once your account is active.
                    </p>
                    <Button variant="outline" onClick={signOut}>
                        Logout
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
