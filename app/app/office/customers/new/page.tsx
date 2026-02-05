"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { ACQUISITION_SOURCES } from "@/lib/constants";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
  acquisitionSource: z.enum(ACQUISITION_SOURCES).optional(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "Tax information is required when 'Use Tax Invoice' is checked",
  path: ["taxName"], 
});


export default function OfficeCustomersNewPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    },
  });

  const useTax = form.watch("useTax");

  const onSubmit = async (values: z.infer<typeof customerSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    
    try {
      const addData = { 
        ...values, 
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      await addDoc(collection(db, "customers"), addData);
      toast({ title: "เพิ่มข้อมูลลูกค้าสำเร็จ" });
      router.push("/app/management/customers");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Creation Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
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
                        <FormItem><FormLabel>เบอร์โทรศัพท์</FormLabel><FormControl><Input {...field} placeholder="เช่น 0812345678" /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-primary">การตลาด</CardTitle></CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="acquisitionSource"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>ลูกค้ารู้จักร้านจากช่องทางไหน?</FormLabel>
                                    <FormDescription className="text-xs">ช่วยระบุเพื่อให้ฝ่ายบริหารนำไปวิเคราะห์ช่องทางการตลาด</FormDescription>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
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
                            <FormLabel>ต้องการใบกำกับภาษี (Use Tax Invoice)</FormLabel>
                            <FormDescription className="text-xs">ระบุข้อมูลเพื่อใช้ในการออกใบกำกับภาษีเต็มรูปแบบ</FormDescription>
                        </div>
                        </FormItem>
                    )} />
                    {useTax && (
                        <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                            <FormField name="taxName" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>ชื่อผู้เสียภาษี (Tax Name)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField name="taxAddress" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>ที่อยู่ผู้เสียภาษี (Tax Address)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField name="taxId" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>เลขที่ผู้เสียภาษี (Tax ID)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                            เพิ่มลูกค้า
                        </Button>
                        <Button type="button" variant="outline" asChild className="flex-1 sm:flex-none">
                            <Link href="/app/management/customers">ยกเลิก</Link>
                        </Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </>
  );
}
