"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VENDOR_TYPES } from "@/lib/constants";
import { vendorTypeLabel } from "@/lib/ui-labels";

const vendorSchema = z.object({
  shortName: z.string().min(1, "กรุณากรอกชื่อย่อ").max(10, "ชื่อย่อต้องไม่เกิน 10 ตัวอักษร"),
  companyName: z.string().min(1, "กรุณากรอกชื่อร้าน/บริษัท"),
  vendorType: z.enum(VENDOR_TYPES),
  address: z.string().optional(),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  email: z.string().email({ message: "อีเมลไม่ถูกต้อง" }).optional().or(z.literal('')),
  taxId: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.vendorType === 'CONTRACTOR') {
    if (!data.taxId || data.taxId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "กรุณากรอกเลขประจำตัวผู้เสียภาษีสำหรับผู้รับเหมา",
        path: ["taxId"],
      });
    }
    if (!data.address || data.address.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "กรุณากรอกที่อยู่สำหรับผู้รับเหมา",
        path: ["address"],
      });
    }
  }
});

type VendorFormData = z.infer<typeof vendorSchema>;

export default function NewVendorPage() {
  const router = useRouter();
  const { db } = useFirebase();
  const { toast } = useToast();

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      shortName: "",
      companyName: "",
      vendorType: "SUPPLIER",
      address: "",
      phone: "",
      contactName: "",
      contactPhone: "",
      email: "",
      taxId: "",
      notes: "",
    },
  });

  const onSubmit = async (values: VendorFormData) => {
    if (!db) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
      return;
    }

    try {
      // Check for unique shortName
      const q = query(collection(db, "vendors"), where("shortName", "==", values.shortName.toUpperCase()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        form.setError("shortName", { type: "manual", message: "ชื่อย่อนี้ถูกใช้ไปแล้ว" });
        return;
      }

      const dataToAdd = {
        ...values,
        shortName: values.shortName.toUpperCase(),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "vendors"), dataToAdd);
      toast({ title: "เพิ่มร้านค้าสำเร็จ" });
      router.push("/app/office/parts/vendors");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  return (
    <>
      <PageHeader title="เพิ่มร้านค้าใหม่" description="กรอกข้อมูลร้านค้าหรือคู่ค้าใหม่" />
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
                    <FormControl><Input placeholder="เช่น BBL, SDK, DENSO" {...field} className="uppercase" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ชื่อร้าน/บริษัท</FormLabel>
                    <FormControl><Input placeholder="บริษัท กรุงเทพน้ำมันเครื่อง จำกัด" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="vendorType" render={({ field }) => (
                <FormItem>
                  <FormLabel>ประเภทธุรกิจ</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกประเภทธุรกิจ" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VENDOR_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{vendorTypeLabel(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลการติดต่อและที่อยู่</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรศัพท์ร้าน</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>อีเมล</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Separator />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem><FormLabel>ผู้ติดต่อ</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรผู้ติดต่อ</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
                  <FormItem><FormLabel>เลขผู้เสียภาษี</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              บันทึกร้านค้า
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/app/office/parts/vendors"><ArrowLeft className="mr-2 h-4 w-4" /> ยกเลิก</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
