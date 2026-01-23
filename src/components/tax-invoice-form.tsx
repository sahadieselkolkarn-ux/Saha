"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

import { createDocument } from "@/firebase/documents";
import type { Job, StoreSettings, Customer, UserProfile } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const taxInvoiceFormSchema = z.object({
  jobId: z.string(),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "At least one item is required."),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  isVat: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  notes: z.string().optional(),
  senderName: z.string().optional(),
  receiverName: z.string().optional(),
});

type TaxInvoiceFormData = z.infer<typeof taxInvoiceFormSchema>;

export function TaxInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const jobId = useMemo(() => searchParams.get("jobId"), [searchParams]);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob, error: jobError } = useDoc<Job>(jobDocRef);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(db && job?.customerId ? doc(db, 'customers', job.customerId) : null);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<TaxInvoiceFormData>({
    resolver: zodResolver(taxInvoiceFormSchema),
    defaultValues: {
      jobId: jobId || "",
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      isVat: true,
      vatAmount: 0,
      grandTotal: 0,
      notes: "",
      senderName: "",
      receiverName: "",
    },
  });

  useEffect(() => {
    if (job) {
      const defaultItem = { description: job.description, quantity: 1, unitPrice: 0, total: 0 };
      if (job.technicalReport) {
        form.setValue('items', [{ ...defaultItem, description: job.technicalReport }]);
      } else {
        form.setValue('items', [defaultItem]);
      }
    }
     if (profile) {
      form.setValue('senderName', profile.displayName);
    }
    if (job?.customerSnapshot) {
      form.setValue('receiverName', job.customerSnapshot.name);
    }
  }, [job, profile, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = form.watch("items");
  const watchedDiscount = form.watch("discountAmount");
  const watchedIsVat = form.watch("isVat");

  useEffect(() => {
    let subtotal = 0;
    watchedItems.forEach((item, index) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const total = quantity * unitPrice;
      form.setValue(`items.${index}.total`, total);
      subtotal += total;
    });

    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal);
    form.setValue("net", net);
    form.setValue("vatAmount", vatAmount);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const onSubmit = async (data: TaxInvoiceFormData) => {
    if (!db || !jobId || !job || !customer || !storeSettings || !profile) {
        toast({ variant: "destructive", title: "Missing data for invoice creation." });
        return;
    }

    try {
        const documentData = {
            docDate: data.issueDate,
            jobId: data.jobId,
            customerSnapshot: { ...customer },
            carSnapshot: {
                licensePlate: job.carServiceDetails?.licensePlate,
                details: job.description
            },
            storeSnapshot: { ...storeSettings },
            items: data.items,
            subtotal: data.subtotal,
            discountAmount: data.discountAmount || 0,
            net: data.net,
            withTax: data.isVat,
            vatAmount: data.vatAmount,
            grandTotal: data.grandTotal,
            notes: data.notes,
            dueDate: data.dueDate,
            senderName: data.senderName,
            receiverName: data.receiverName,
        };

        const docNo = await createDocument(
            db,
            'TAX_INVOICE',
            documentData,
            profile,
            'WAITING_CUSTOMER_PICKUP'
        );

        toast({ title: "Tax Invoice Created", description: `Successfully created invoice ${docNo}` });
        router.push('/app/office/documents/tax-invoice');

    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to create invoice", description: error.message });
    }
  };

  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomer;

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!jobId) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>No Job ID provided. Please create an invoice from a job.</div>
  }
  
  if (jobError) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>Error loading job: {jobError.message}</div>
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> Back</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
              Save Invoice
            </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border rounded-lg bg-card">
            <div className="lg:col-span-2 space-y-2">
                <h2 className="text-xl font-bold">{storeSettings?.taxName || 'Your Company'}</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{storeSettings?.taxAddress}</p>
                <p className="text-sm text-muted-foreground">โทร: {storeSettings?.phone}</p>
                <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {storeSettings?.taxId}</p>
            </div>
            <div className="space-y-4">
                 <h1 className="text-2xl font-bold text-right">ใบกำกับภาษี</h1>
                 <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                 <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>ครบกำหนดชำระ</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
            </div>
        </div>

        <Card>
            <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
            <CardContent>
                <p className="font-semibold">{customer?.name}</p>
                <p className="text-sm text-muted-foreground">{customer?.taxAddress || 'N/A'}</p>
                <p className="text-sm text-muted-foreground">โทร: {customer?.phone}</p>
                <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {customer?.taxId || 'N/A'}</p>
                 <Separator className="my-4" />
                <p className="font-semibold">เรื่อง: {job?.description}</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>รายการ</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>รายละเอียด</TableHead>
                            <TableHead className="text-right">จำนวน</TableHead>
                            <TableHead className="text-right">ราคา/หน่วย</TableHead>
                            <TableHead className="text-right">ยอดรวม</TableHead>
                            <TableHead/>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                            <TableRow key={field.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} placeholder="Service or product" />)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                <TableCell className="text-right font-medium">{form.watch(`items.${index}.total`).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})}><PlusCircle/> Add Item</Button>
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Card>
                <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="notes" render={({ field }) => (<Textarea {...field} placeholder="เงื่อนไขการชำระเงิน หรืออื่นๆ" rows={5} />)} />
                </CardContent>
            </Card>
            <div className="space-y-4">
                 <div className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{form.watch('subtotal').toLocaleString()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">ส่วนลด</span><FormField control={form.control} name="discountAmount" render={({ field }) => (<Input type="number" {...field} className="w-32 text-right"/>)}/></div>
                    <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{form.watch('net').toLocaleString()}</span></div>
                    <div className="flex justify-between items-center">
                        <FormField control={form.control} name="isVat" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                <FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel>
                            </FormItem>
                        )}/>
                        <span>{form.watch('vatAmount').toLocaleString()}</span>
                    </div>
                     <Separator/>
                    <div className="flex justify-between items-center text-lg font-bold"><span >ยอดสุทธิ</span><span>{form.watch('grandTotal').toLocaleString()}</span></div>
                 </div>
            </div>
        </div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งของ</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับของ</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
        </div>
      </form>
    </Form>
  );
}
