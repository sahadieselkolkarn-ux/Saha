"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp, getDocs, query, where, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ArrowLeft, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VENDOR_TYPES } from "@/lib/constants";
import { vendorTypeLabel } from "@/lib/ui-labels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const dynamic = 'force-dynamic';

const vendorSchema = z.object({
  shortName: z.string().min(1, "กรุณากรอกชื่อย่อ").max(15, "ชื่อย่อต้องไม่เกิน 15 ตัวอักษร"),
  companyName: z.string().min(1, "กรุณากรอกชื่อร้าน/บริษัท"),
  vendorType: z.enum(VENDOR_TYPES),
  address: z.string().optional(),
  phone: z.string().min(9, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (อย่างน้อย 9 หลัก)"),
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateVendor, setDuplicateVendor] = useState<{ id: string, name: string, phone: string } | null>(null);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);

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

    setIsSubmitting(true);

    try {
      // 1. Check for unique shortName
      const qShort = query(collection(db, "vendors"), where("shortName", "==", values.shortName.toUpperCase()));
      const snapShort = await getDocs(qShort);
      if (!snapShort.empty) {
        form.setError("shortName", { type: "manual", message: "ชื่อย่อนี้ถูกใช้ไปแล้ว" });
        setIsSubmitting(false);
        return;
      }

      // 2. Check for duplicate phone
      const qPhone = query(collection(db, "vendors"), where("phone", "==", values.phone.trim()), limit(1));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        const existing = snapPhone.docs[0].data();
        setDuplicateVendor({ id: snapPhone.docs[0].id, name: existing.companyName, phone: existing.phone });
        setShowDuplicateAlert(true);
        setIsSubmitting(false);
        return;
      }

      const dataToAdd = {
        ...values,
        shortName: values.shortName.toUpperCase(),
        phone: values.phone.trim(),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "vendors"), dataToAdd);
      toast({ title: "เพิ่มร้านค้าสำเร็จ" });
      router.push("/app/office/parts/vendors");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
      setIsSubmitting(false);
    }
  };

  const handleGoToEdit = () => {
    if (duplicateVendor) {
      router.push(`/app/office/parts/vendors/${duplicateVendor.id}`);
    }
  };

  return (
    <>
      <PageHeader title="เพิ่มร้านค้า/ผู้รับเหมา" description="กรอกข้อมูลร้านค้า คู่ค้า หรือผู้รับเหมางานนอกรายใหม่" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(data => onSubmit(data))} className="space-y-6 max-w-4xl mx-auto pb-10">
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลหลัก</CardTitle>
              <CardDescription>ข้อมูลที่จำเป็นสำหรับระบุตัวตนบนระบบ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="shortName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ชื่อย่อ (ไม่ซ้ำ)</FormLabel>
                    <FormControl><Input placeholder="เช่น BBL, SDK, DENSO" {...field} className="uppercase" disabled={isSubmitting} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ชื่อร้าน/บริษัท (ทางการ)</FormLabel>
                    <FormControl><Input placeholder="บริษัท กรุงเทพน้ำมันเครื่อง จำกัด" {...field} disabled={isSubmitting} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="vendorType" render={({ field }) => (
                <FormItem>
                  <FormLabel>ประเภทธุรกิจ</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
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
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-primary">เบอร์โทรศัพท์ร้าน (จำเป็น)</FormLabel>
                  <FormControl><Input placeholder="เช่น 0812345678" {...field} disabled={isSubmitting} /></FormControl>
                  <FormDescription className="text-[10px]">ใช้สำหรับตรวจสอบข้อมูลซ้ำและใช้ในการออกบิล</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea placeholder="เลขที่บ้าน ถนน แขวง/ตำบล..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>อีเมล</FormLabel><FormControl><Input type="email" placeholder="example@mail.com" {...field} value={field.value ?? ''} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Separator />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem><FormLabel>ชื่อผู้ติดต่อ (เซลล์/ช่าง)</FormLabel><FormControl><Input placeholder="ชื่อผู้ติดต่อ" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรผู้ติดต่อ (ถ้ามี)</FormLabel><FormControl><Input placeholder="เบอร์โทรตรง" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลภาษีและหมายเหตุ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField control={form.control} name="taxId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>เลขประจำตัวผู้เสียภาษี</FormLabel>
                    <FormControl><Input placeholder="เลข 13 หลัก" {...field} disabled={isSubmitting} /></FormControl>
                    <FormDescription className="text-[10px]">จำเป็นหากต้องการออกใบหัก ณ ที่จ่าย</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>หมายเหตุเพิ่มเติม</FormLabel><FormControl><Textarea placeholder="ข้อมูลอื่นๆ เช่น เงื่อนไขการส่งของ..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  บันทึกร้านค้า
                </>
              )}
            </Button>
            <Button type="button" variant="outline" asChild disabled={isSubmitting}>
              <Link href="/app/office/parts/vendors"><ArrowLeft className="mr-2 h-4 w-4" /> ยกเลิก</Link>
            </Button>
          </div>
        </form>
      </Form>

      {/* Duplicate Phone Check Alert */}
      <AlertDialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      พบข้อมูลซ้ำในระบบ
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                      <p>เบอร์โทรศัพท์ <span className="font-bold">{duplicateVendor?.phone}</span> ถูกใช้งานแล้วโดยร้านค้า:</p>
                      <div className="p-3 bg-muted rounded-md font-bold text-center border">
                          {duplicateVendor?.name}
                      </div>
                      <p className="font-semibold text-primary">ระบบมีข้อมูลร้านค้านี้อยู่แล้ว ต้องการไปที่หน้าแก้ไขข้อมูลหรือไม่?</p>
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setShowDuplicateAlert(false); setDuplicateVendor(null); }}>
                      ยกเลิก
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleGoToEdit}>
                      ใช่ ไปหน้าแก้ไขข้อมูล
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
