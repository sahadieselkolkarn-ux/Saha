"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
    const { profile, signOut, loading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const handleLogout = async () => {
        try {
            await signOut();
            toast({ title: "Logged out successfully" });
            router.push('/login');
        } catch (error: any) {
            toast({ variant: "destructive", title: "Logout failed", description: error.message });
        }
    };

    if (loading || !profile) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const getInitials = (name?: string) => {
        if (!name) return "?";
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    return (
        <>
            <PageHeader title="Settings" description="View your profile and manage application settings." />

            <div className="max-w-2xl mx-auto">
                <Card>
                    <CardHeader className="flex flex-row items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile.displayName}`} alt={profile.displayName} />
                            <AvatarFallback>{getInitials(profile.displayName)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{profile.displayName}</CardTitle>
                            <CardDescription>{profile.email}</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="text-sm">
                            <p className="font-semibold">Department:</p>
                            <p className="text-muted-foreground">{profile.department}</p>
                        </div>
                        <div className="text-sm">
                            <p className="font-semibold">Role:</p>
                            <p className="text-muted-foreground">{profile.role}</p>
                        </div>
                        <div className="text-sm">
                            <p className="font-semibold">Status:</p>
                            <p className="text-muted-foreground">{profile.status}</p>
                        </div>
                        <Button onClick={handleLogout} variant="outline">
                            <LogOut className="mr-2 h-4 w-4"/>
                            Logout
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
