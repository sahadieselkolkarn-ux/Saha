"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter, FirestorePermissionError } from "@/firebase";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().min(9, "Please enter a valid phone number."),
});

export default function ProfilePage() {
  const { profile, user, db, auth } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      displayName: profile?.displayName || "",
      phone: profile?.phone || "",
    },
  });

  if (!profile || !user) {
    return null;
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!db || !auth?.currentUser) return;
    setIsLoading(true);

    const userDocRef = doc(db, "users", user.uid);
    const updateData = {
      displayName: values.displayName,
      phone: values.phone,
      updatedAt: serverTimestamp(),
    };

    updateDoc(userDocRef, updateData)
      .then(() => {
        toast({
          title: "Profile Updated",
          description: "Your profile information has been successfully updated.",
        });
        if (auth.currentUser && auth.currentUser.displayName !== values.displayName) {
          updateProfile(auth.currentUser, {
            displayName: values.displayName,
          }).catch((error) => {
            console.error("Error updating auth profile:", error);
            toast({
              variant: "destructive",
              title: "Could not update display name",
              description: error.message,
            });
          });
        }
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: error.message,
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <>
      <PageHeader title="My Profile" description="View and edit your personal information." />
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>Changes to your name and phone number will be saved here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Email</FormLabel>
                <Input value={profile.email} disabled />
              </FormItem>
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Input value={profile.role || "N/A"} disabled />
              </FormItem>
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Input value={profile.department || "N/A"} disabled />
              </FormItem>
              <Button type="submit" disabled={isLoading || !form.formState.isDirty}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
