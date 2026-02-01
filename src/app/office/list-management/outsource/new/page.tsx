"use client";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Save, ArrowLeft } from "lucide-react";

const outsourceVendorSchema = z.object({
  shopName: z.string().min(1, "กรุณากรอกชื่อร้าน/อู่"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
});

type OutsourceVendorFormData = z.infer<typeof outsourceVendorSchema>;

export default function NewOutsourceVendorPage() {
  const router = useRouter();
  const { db } = useFirebase();
  const { toast } = useToast();
  const { profile, user, loading: authLoading } = useAuth();

  const form = useForm<OutsourceVendorFormData>({
    resolver: zodResolver(outsourceVendorSchema),
    defaultValues: {
      shopName: "",
      contactName: "",
      phone: "",
      location: "",
    },
  });

  const onSubmit = async (values: OutsourceVendorFormData) => {
    if (!db) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
      return;
    }

    if (!user || !profile) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
        return;
    }
    
    const isAllowed = profile.role === "ADMIN" || profile.role === "MANAGER" || profile.department === "OFFICE" || profile.department === "MANAGEMENT";
    if (!isAllowed) {
        toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "คุณไม่มีสิทธิ์บันทึกข้อมูล Outsource" });
        return;
    }

    try {
      const dataToAdd = {
        ...values,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "outsourceVendors"), dataToAdd);
      toast({ title: "เพิ่มรายชื่อ Outsource สำเร็จ" });
      router.push("/app/office/list-management/outsource");
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: `${error?.code ?? "unknown"}: ${error?.message ?? "Unknown error"}` });
    }
  };

  return (
    <>
      <PageHeader title="เพิ่มรายชื่อ Outsource" description="กรอกข้อมูลร้านค้าหรืออู่สำหรับส่งต่องาน" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูล Outsource</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="shopName" render={({ field }) => (
                <FormItem>
                  <FormLabel>ชื่อร้าน/อู่</FormLabel>
                  <FormControl><Input placeholder="เช่น อู่ช่างเอก, ร้านเทอร์โบใหญ่" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>ชื่อผู้ติดต่อ</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>เบอร์โทร</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>สถานที่</FormLabel>
                  <FormControl><Input placeholder="เช่น บางบอน, พระราม 2" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button type="submit" disabled={form.formState.isSubmitting || authLoading}>
              {(form.formState.isSubmitting || authLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              บันทึก
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
