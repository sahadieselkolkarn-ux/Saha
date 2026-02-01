
"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, updateDoc, serverTimestamp, getDocs, query, where, collection, documentId } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { Vendor } from "@/lib/types";

const vendorSchema = z.object({
  shortName: z.string().min(1, "กรุณากรอกชื่อย่อ").max(10, "ชื่อย่อต้องไม่เกิน 10 ตัวอักษร"),
  companyName: z.string().min(1, "กรุณากรอกชื่อร้าน/บริษัท"),
  address: z.string().optional(),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  email: z.string().email({ message: "อีเมลไม่ถูกต้อง" }).optional().or(z.literal('')),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});

type VendorFormData = z.infer<typeof vendorSchema>;

export default function EditVendorPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const vendorId = params.vendorId as string;
  const { db } = useFirebase();
  const { toast } = useToast();
  const { profile } = useAuth();

  const isViewMode = searchParams.get("view") === "1";
  
  const canEditPermission = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.role === 'MANAGER' || profile.department === 'OFFICE';
  }, [profile]);

  const canEdit = canEditPermission && !isViewMode;

  const vendorDocRef = useMemo(() => {
    if (!db || !vendorId) return null;
    return doc(db, "vendors", vendorId);
  }, [db, vendorId]);

  const { data: vendor, isLoading, error } = useDoc<Vendor>(vendorDocRef);

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        shortName: vendor.shortName,
        companyName: vendor.companyName,
        address: vendor.address || "",
        phone: vendor.phone || "",
        contactName: vendor.contactName || "",
        contactPhone: vendor.contactPhone || "",
        email: vendor.email || "",
        taxId: vendor.taxId || "",
        notes: vendor.notes || "",
      });
    }
  }, [vendor, form]);

  const onSubmit = async (values: VendorFormData) => {
    if (!canEdit) {
      toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้" });
      return;
    }
    if (!db || !vendorDocRef) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
      return;
    }

    try {
      const q = query(
        collection(db, "vendors"),
        where("shortName", "==", values.shortName.toUpperCase()),
        where(documentId(), "!=", vendorId)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        form.setError("shortName", { type: "manual", message: "ชื่อย่อนี้ถูกใช้ไปแล้ว" });
        return;
      }
      
      const dataToUpdate = {
        ...values,
        shortName: values.shortName.toUpperCase(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(vendorDocRef, dataToUpdate);
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      router.push("/app/office/parts/vendors");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  if (isLoading) {
    return <Card><CardContent><Skeleton className="h-96" /></CardContent></Card>;
  }

  if (error || !vendor) {
    return <PageHeader title="ไม่พบร้านค้า" description="ไม่พบข้อมูลร้านค้าที่ต้องการแก้ไข" />;
  }

  return (
    <>
      <PageHeader title={canEdit ? "แก้ไขข้อมูลร้านค้า" : "ดูข้อมูลร้านค้า"} description={`ร้านค้า: ${vendor.companyName}`} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
           <Card>
            <CardHeader>
              <CardTitle>ข้อมูลหลัก</CardTitle>
              <CardDescription>ข้อมูลที่จำเป็นสำหรับระบุร้านค้า</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="shortName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ชื่อย่อ (ไม่ซ้ำ)</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ''} className="uppercase" disabled={!canEdit} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ชื่อร้าน/บริษัท</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลการติดต่อและที่อยู่</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรศัพท์ร้าน</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>อีเมล</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Separator />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem><FormLabel>ผู้ติดต่อ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรผู้ติดต่อ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลอื่นๆ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField control={form.control} name="taxId" render={({ field }) => (
                  <FormItem><FormLabel>เลขผู้เสียภาษี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
            </CardContent>
          </Card>

          <div className="flex gap-4">
            {canEdit && (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    บันทึกการแก้ไข
                </Button>
            )}
            <Button type="button" variant="outline" asChild>
              <Link href="/app/office/parts/vendors"><ArrowLeft className="mr-2 h-4 w-4" /> กลับ</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
