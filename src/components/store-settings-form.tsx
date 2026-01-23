
"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, setDoc } from "firebase/firestore";

import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import type { StoreSettings } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

const storeSettingsSchema = z.object({
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  branch: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  informalName: z.string().optional(),
  openingHours: z.string().optional(),
});

export function StoreSettingsForm() {
  const { db } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemo(() => {
    if (!db) return null;
    return doc(db, "settings", "store");
  }, [db]);

  const { data: settings, isLoading } = useDoc<StoreSettings>(settingsDocRef);

  const form = useForm<z.infer<typeof storeSettingsSchema>>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = async (values: z.infer<typeof storeSettingsSchema>) => {
    if (!settingsDocRef) return;
    try {
      await setDoc(settingsDocRef, values, { merge: true });
      toast({
        title: "Settings Saved",
        description: "Store settings have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error Saving Settings",
        description: error.message,
      });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลร้าน</CardTitle>
            <CardDescription>ข้อมูลสำหรับออกเอกสารและข้อมูลทั่วไปของร้าน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="taxName" render={({ field }) => (<FormItem><FormLabel>ชื่อสำหรับออกภาษี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="taxAddress" render={({ field }) => (<FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="branch" render={({ field }) => (<FormItem><FormLabel>สาขา</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="taxId" render={({ field }) => (<FormItem><FormLabel>เลขที่ผู้เสียภาษี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            </div>
             <FormField control={form.control} name="informalName" render={({ field }) => (<FormItem><FormLabel>ชื่อไม่เป็นทางการ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
          </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>เวลาทำการ</CardTitle>
            </CardHeader>
            <CardContent>
                <FormField control={form.control} name="openingHours" render={({ field }) => (<FormItem><FormLabel>รายละเอียดเวลาทำการ</FormLabel><FormControl><Textarea placeholder="เช่น จันทร์-เสาร์: 8:00 - 17:00" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            </CardContent>
        </Card>
        <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
              Save Settings
            </Button>
        </div>
      </form>
    </Form>
  );
}

    