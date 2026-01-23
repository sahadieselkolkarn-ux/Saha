
"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, setDoc } from "firebase/firestore";

import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import type { DocumentSettings } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

const documentSettingsSchema = z.object({
  quotationPrefix: z.string().optional(),
  deliveryNotePrefix: z.string().optional(),
  taxInvoicePrefix: z.string().optional(),
  receiptPrefix: z.string().optional(),
  billingNotePrefix: z.string().optional(),
});

export function DocumentSettingsForm() {
  const { db } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemo(() => {
    if (!db) return null;
    return doc(db, "settings", "documents");
  }, [db]);

  const { data: settings, isLoading } = useDoc<DocumentSettings>(settingsDocRef);

  const form = useForm<z.infer<typeof documentSettingsSchema>>({
    resolver: zodResolver(documentSettingsSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = async (values: z.infer<typeof documentSettingsSchema>) => {
    if (!settingsDocRef) return;
    try {
      await setDoc(settingsDocRef, values, { merge: true });
      toast({
        title: "Settings Saved",
        description: "Document settings have been updated successfully.",
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
            <CardTitle>เลขที่เอกสาร</CardTitle>
            <CardDescription>
              กำหนดคำนำหน้า (Prefix) สำหรับเอกสารแต่ละประเภท
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="quotationPrefix" render={({ field }) => (<FormItem><FormLabel>ใบเสนอราคา</FormLabel><FormControl><Input placeholder="QT" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="deliveryNotePrefix" render={({ field }) => (<FormItem><FormLabel>ใบส่งของชั่วคราว</FormLabel><FormControl><Input placeholder="DN" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="taxInvoicePrefix" render={({ field }) => (<FormItem><FormLabel>ใบกำกับภาษี</FormLabel><FormControl><Input placeholder="INV" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="receiptPrefix" render={({ field }) => (<FormItem><FormLabel>ใบเสร็จรับเงิน</FormLabel><FormControl><Input placeholder="RE" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="billingNotePrefix" render={({ field }) => (<FormItem><FormLabel>ใบวางบิล</FormLabel><FormControl><Input placeholder="BN" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
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

    