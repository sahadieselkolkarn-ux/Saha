"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, addDoc, serverTimestamp, getDocs, query, where, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage, 
  FormDescription 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ACQUISITION_SOURCES } from "@/lib/constants";
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

const customerSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อลูกค้า"),
  phone: z.string().min(9, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (อย่างน้อย 9 หลัก)"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
  taxPhone: z.string().optional(),
  taxBranchType: z.enum(['HEAD_OFFICE', 'BRANCH']).optional(),
  taxBranchNo: z.string().optional(),
  acquisitionSource: z.enum(ACQUISITION_SOURCES, {
    errorMap: () => ({ message: "กรุณาเลือกช่องทางที่ลูกค้ารู้จักร้าน เพื่อใช้ทำสถิติในแดชบอร์ด" })
  }),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "กรุณากรอกข้อมูลภาษีให้ครบถ้วนเมื่อเลือก 'ต้องการใบกำกับภาษี'",
  path: ["taxName"], 
}).refine(data => !data.useTax || data.taxBranchType !== 'BRANCH' || (data.taxBranchNo && data.taxBranchNo.length === 5), {
  message: "กรุณาระบุรหัสสาขา 5 หลัก",
  path: ["taxBranchNo"],
});


export default function OfficeCustomersNewPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateCustomer, setDuplicateCustomer] = useState<{ id: string, name: string, phone: string } | null>(null);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      detail: "",
      useTax: false,
      taxName: "",
      taxAddress: "",
      taxId: "",
      taxPhone: "",
      taxBranchType: 'HEAD_OFFICE',
      taxBranchNo: '00000',
      // @ts-ignore - Let it be empty to trigger validation
      acquisitionSource: undefined,
    },
  });

  const useTax = form.watch("useTax");
  const taxBranchType = form.watch("taxBranchType");

  const onSubmit = async (values: z.infer<typeof customerSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    
    try {
      // Check for duplicate phone number
      const q = query(collection(db, "customers"), where("phone", "==", values.phone.trim()), limit(1));
      const querySnap = await getDocs(q);
      
      if (!querySnap.empty) {
        const existing = querySnap.docs[0].data();
        setDuplicateCustomer({ id: querySnap.docs[0].id, name: existing.name, phone: existing.phone });
        setShowDuplicateAlert(true);
        setIsSubmitting(false);
        return;
      }

      const addData = { 
        name: values.name.trim(),
        phone: values.phone.trim(),
        detail: values.detail || "",
        useTax: values.useTax,
        taxName: values.useTax ? values.taxName : "",
        taxAddress: values.useTax ? values.taxAddress : "",
        taxId: values.useTax ? values.taxId : "",
        taxPhone: values.useTax ? values.taxPhone : "",
        taxBranchType: values.useTax ? values.taxBranchType : null,
        taxBranchNo: values.useTax && values.taxBranchType === 'BRANCH' ? values.taxBranchNo : (values.taxBranchType === 'HEAD_OFFICE' ? '00000' : null),
        acquisitionSource: values.acquisitionSource,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      
      await addDoc(collection(db, "customers"), addData);
      
      toast({ title: "เพิ่มข้อมูลลูกค้าสำเร็จ" });
      router.push("/app/management/customers");
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "เกิดข้อผิดพลาด", 
        description: error.message 
      });
      setIsSubmitting(false);
    }
  };

  const handleGoToEdit = () => {
    if (duplicateCustomer) {
      router.push(`/app/management/customers?editPhone=${duplicateCustomer.phone}`);
    }
  };


  return (
    <>
      <PageHeader title="เพิ่มลูกค้าใหม่" description="กรอกข้อมูลเพื่อเพิ่มลูกค้าใหม่เข้าระบบ" />
        <Card>
            <CardContent className="pt-6">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto">
                    <FormField name="name" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>ชื่อลูกค้า</FormLabel><FormControl><Input {...field} placeholder="เช่น คุณสมชาย รักบริการ" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="phone" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>เบอร์โทรศัพท์ (จำเป็น)</FormLabel><FormControl><Input {...field} placeholder="เช่น 0812345678" /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <Card className="bg-primary/5 border-primary/20 shadow-none">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-bold text-primary">การตลาด (Marketing)</CardTitle>
                          <CardDescription className="text-xs">ข้อมูลนี้ใช้ทำสถิติในหน้าแดชบอร์ด</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2">
                            <FormField
                                control={form.control}
                                name="acquisitionSource"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>ลูกค้ารู้จักร้านจากช่องทางไหน?</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        value={field.value}
                                        className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                                        >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="REFERRAL" id="r-referral" />
                                            <Label htmlFor="r-referral" className="font-normal cursor-pointer">ลูกค้าแนะนำ</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="GOOGLE" id="r-google" />
                                            <Label htmlFor="r-google" className="font-normal cursor-pointer">Google</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="FACEBOOK" id="r-facebook" />
                                            <Label htmlFor="r-facebook" className="font-normal cursor-pointer">Facebook</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="TIKTOK" id="r-tiktok" />
                                            <Label htmlFor="r-tiktok" className="font-normal cursor-pointer">Tiktok</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="YOUTUBE" id="r-youtube" />
                                            <Label htmlFor="r-youtube" className="font-normal cursor-pointer">Youtube</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="OTHER" id="r-other" />
                                            <Label htmlFor="r-other" className="font-normal cursor-pointer">อื่นๆ</Label>
                                        </div>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <FormField name="detail" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>รายละเอียดเพิ่มเติม (ถ้ามี)</FormLabel><FormControl><Textarea placeholder="เช่น รถรุ่นอะไร, เคยซ่อมอะไรมาบ้าง..." {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="useTax" control={form.control} render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-bold text-primary">ต้องการใบกำกับภาษี (Use Tax Invoice)</FormLabel>
                            <FormDescription className="text-xs">ระบุข้อมูลเพื่อใช้ในการออกใบกำกับภาษีเต็มรูปแบบ</FormDescription>
                        </div>
                        </FormItem>
                    )} />
                    {useTax && (
                        <div className="space-y-4 p-4 border rounded-md bg-muted/50 border-primary/20 animate-in fade-in slide-in-from-top-1">
                            <h4 className="text-sm font-bold text-primary uppercase tracking-wider border-b pb-2">รายละเอียดสำหรับการออกใบกำกับภาษี</h4>
                            
                            <FormField name="taxName" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>ชื่อผู้เสียภาษี (Tax Name)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="ชื่อบริษัท หรือ ชื่อ-นามสกุล" /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <FormField name="taxAddress" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>ที่อยู่ผู้เสียภาษี (Tax Address)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="ระบุเลขที่บ้าน ถนน..." /></FormControl><FormMessage /></FormItem>
                            )} />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField name="taxId" control={form.control} render={({ field }) => (
                                    <FormItem><FormLabel>เลขประจำตัวผู้เสียภาษี (Tax ID)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="เลข 13 หลัก" /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField name="taxPhone" control={form.control} render={({ field }) => (
                                    <FormItem><FormLabel>เบอร์โทรศัพท์ (สำหรับบิล)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="ระบุเบอร์โทร" /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>

                            <FormField
                                control={form.control}
                                name="taxBranchType"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>สถานะสถานประกอบการ</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        className="flex flex-col space-y-1"
                                        >
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="HEAD_OFFICE" /></FormControl>
                                            <Label className="font-normal cursor-pointer">สำนักงานใหญ่</Label>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="BRANCH" /></FormControl>
                                            <Label className="font-normal cursor-pointer">สาขา</Label>
                                        </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    </FormItem>
                                )}
                            />

                            {taxBranchType === 'BRANCH' && (
                                <FormField name="taxBranchNo" control={form.control} render={({ field }) => (
                                    <FormItem className="animate-in fade-in slide-in-from-left-1">
                                        <FormLabel>รหัสสาขา (5 หลัก)</FormLabel>
                                        <FormControl><Input {...field} value={field.value ?? ''} placeholder="เช่น 00001" maxLength={5} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            )}
                        </div>
                    )}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                            บันทึกข้อมูลลูกค้า
                        </Button>
                        <Button type="button" variant="outline" asChild className="flex-1 sm:flex-none">
                            <Link href="/app/management/customers">ยกเลิก</Link>
                        </Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>

        {/* Duplicate Phone Check Alert */}
        <AlertDialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        พบข้อมูลซ้ำในระบบ
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                        <p>เบอร์โทรศัพท์ <span className="font-bold">{duplicateCustomer?.phone}</span> ถูกใช้งานแล้วโดยลูกค้า:</p>
                        <div className="p-3 bg-muted rounded-md font-bold text-center border">
                            {duplicateCustomer?.name}
                        </div>
                        <p className="font-semibold text-primary">ระบบมีข้อมูลอยู่แล้ว ต้องการแก้ไขข้อมูลลูกค้าท่านนี้หรือไม่?</p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setShowDuplicateAlert(false); setDuplicateCustomer(null); }}>
                        ไม่ต้องการ (ยกเลิก)
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleGoToEdit}>
                        ใช่ ต้องการแก้ไขข้อมูล
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
