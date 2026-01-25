"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
  taxBranchType: z.enum(['HEAD_OFFICE', 'BRANCH']).optional(),
  taxBranchNo: z.string().optional(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "Tax information is required when 'Use Tax Invoice' is checked",
  path: ["taxName"], 
}).refine(data => !(data.useTax && data.taxBranchType === 'BRANCH') || (data.taxBranchNo && data.taxBranchNo.length === 5), {
    message: "กรุณากรอกเลขสาขา 5 หลัก",
    path: ["taxBranchNo"],
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
      taxBranchType: 'HEAD_OFFICE',
      taxBranchNo: "",
    },
  });

  const useTax = form.watch("useTax");
  const taxBranchType = form.watch("taxBranchType");

  const onSubmit = async (values: z.infer<typeof customerSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    
    try {
      const addData = { 
        ...values, 
        taxBranchNo: values.taxBranchType === 'HEAD_OFFICE' ? null : values.taxBranchNo,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() 
      };
      await addDoc(collection(db, "customers"), addData);
      toast({ title: "Customer added successfully" });
      router.push("/app/office/customers");
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
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="phone" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="detail" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Details</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="useTax" control={form.control} render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Use Tax Invoice</FormLabel>
                            <FormMessage />
                        </div>
                        </FormItem>
                    )} />
                    {useTax && (
                        <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                            <FormField name="taxName" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Tax Payer Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField name="taxAddress" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Tax Address</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField name="taxId" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Tax ID</FormLabel><FormControl><Input {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField
                                control={form.control}
                                name="taxBranchType"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>ประเภทสาขา</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        className="flex space-x-4 pt-2"
                                        >
                                        <FormItem className="flex items-center space-x-2">
                                            <FormControl><RadioGroupItem value="HEAD_OFFICE" /></FormControl>
                                            <FormLabel className="font-normal">สำนักงานใหญ่</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2">
                                            <FormControl><RadioGroupItem value="BRANCH" /></FormControl>
                                            <FormLabel className="font-normal">สาขา</FormLabel>
                                        </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                {taxBranchType === 'BRANCH' && (
                                <FormField
                                    control={form.control}
                                    name="taxBranchNo"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>เลขที่สาขา (5 หลัก)</FormLabel>
                                        <FormControl>
                                        <Input {...field} value={field.value ?? ''} maxLength={5} placeholder="00000" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                )}
                        </div>
                    )}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                            Add Customer
                        </Button>
                        <Button type="button" variant="outline" asChild>
                            <Link href="/app/office/customers">Cancel</Link>
                        </Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </>
  );
}
