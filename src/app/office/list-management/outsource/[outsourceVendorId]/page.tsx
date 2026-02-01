"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { OutsourceVendor } from "@/lib/types";

const outsourceVendorSchema = z.object({
  shopName: z.string().min(1, "กรุณากรอกชื่อร้าน/อู่"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
});

type OutsourceVendorFormData = z.infer<typeof outsourceVendorSchema>;

export default function EditOutsourceVendorPage() {
  const router = useRouter();
  const params = useParams();
  const outsourceVendorId = params.outsourceVendorId as string;
  const { db } = useFirebase();
  const { toast } = useToast();

  const vendorDocRef = useMemo(() => {
    if (!db || !outsourceVendorId) return null;
    return doc(db, "outsourceVendors", outsourceVendorId);
  }, [db, outsourceVendorId]);

  const { data: vendor, isLoading, error } = useDoc<OutsourceVendor>(vendorDocRef);

  const form = useForm<OutsourceVendorFormData>({
    resolver: zodResolver(outsourceVendorSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        shopName: vendor.shopName,
        contactName: vendor.contactName || "",
        phone: vendor.phone || "",
        location: vendor.location || "",
      });
    }
  }, [vendor, form]);

  const onSubmit = async (values: OutsourceVendorFormData) => {
    if (!db || !vendorDocRef) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
      return;
    }

    try {
      const dataToUpdate = {
        ...values,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(vendorDocRef, dataToUpdate);
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      router.push("/app/office/list-management/outsource");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  if (isLoading) {
    return <Card><CardContent><Skeleton className="h-96" /></CardContent></Card>;
  }

  if (error || !vendor) {
    return <PageHeader title="ไม่พบรายชื่อ Outsource" description="ไม่พบข้อมูลที่ต้องการแก้ไข" />;
  }

  return (
    <>
      <PageHeader title="แก้ไขข้อมูล Outsource" description={`กำลังแก้ไข: ${vendor.shopName}`} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader><CardTitle>ข้อมูล Outsource</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="shopName" render={({ field }) => (
                <FormItem>
                  <FormLabel>ชื่อร้าน/อู่</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>ชื่อผู้ติดต่อ</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>เบอร์โทร</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>สถานที่</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              บันทึกการแก้ไข
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/app/office/list-management/outsource"><ArrowLeft className="mr-2 h-4 w-4" /> ยกเลิก</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
