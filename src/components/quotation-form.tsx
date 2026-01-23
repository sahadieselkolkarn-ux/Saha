"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, addDoc, collection, serverTimestamp, writeBatch, query, orderBy, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

import type { Job, StoreSettings, DocumentSettings, Customer } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const quotationFormSchema = z.object({
  jobId: z.string(),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "At least one item is required."),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  subtotalAfterDiscount: z.coerce.number(),
  isVat: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  notes: z.string().optional(),
});

type QuotationFormData = z.infer<typeof quotationFormSchema>;

export function QuotationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { db } = useFirebase();
  const { toast } = useToast();

  const jobId = useMemo(() => searchParams.get("jobId"), [searchParams]);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const docSettingsRef = useMemo(() => (db ? doc(db, "settings", "documents") : null), [db]);

  const { data: job, isLoading: isLoadingJob, error: jobError } = useDoc<Job>(jobDocRef);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(db && job?.customerId ? doc(db, 'customers', job.customerId) : null);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  const { data: docSettings, isLoading: isLoadingDoc } = useDoc<DocumentSettings>(docSettingsRef);
  
  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      jobId: jobId || "",
      issueDate: new Date().toISOString().split("T")[0],
      expiryDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      discountAmount: 0,
      subtotalAfterDiscount: 0,
      isVat: true,
      vatAmount: 0,
      grandTotal: 0,
      notes: "",
    },
  });

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
      form.setValue(`items.${index}.total`, total, { shouldValidate: true });
      subtotal += total;
    });

    const discount = watchedDiscount || 0;
    const subtotalAfterDiscount = subtotal - discount;
    const vatAmount = watchedIsVat ? subtotalAfterDiscount * 0.07 : 0;
    const grandTotal = subtotalAfterDiscount + vatAmount;

    form.setValue("subtotal", subtotal);
    form.setValue("subtotalAfterDiscount", subtotalAfterDiscount);
    form.setValue("vatAmount", vatAmount);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const onSubmit = async (data: QuotationFormData) => {
    if (!db || !jobId || !job || !customer || !docSettings) return;

    try {
        const batch = writeBatch(db);

        // 1. Generate Document Number
        const prefix = docSettings.quotationPrefix || "QT";
        const currentYear = new Date().getFullYear();
        
        const q = query(collection(db, "quotations"), orderBy("createdAt", "desc"), limit(1));
        const lastDocSnap = await getDocs(q);
        
        let newIdNumber = 1;
        if (!lastDocSnap.empty) {
            const lastDocData = lastDocSnap.docs[0].data();
            if (lastDocData.documentNumber.startsWith(`${prefix}${currentYear}`)) {
                 const lastIdNum = parseInt(lastDocData.documentNumber.split('-')[1]);
                 if (!isNaN(lastIdNum)) {
                    newIdNumber = lastIdNum + 1;
                 }
            }
        }
        const documentId = `${currentYear}-${String(newIdNumber).padStart(4, '0')}`;
        const documentNumber = `${prefix}${documentId}`;

        // 2. Prepare Quotation Data
        const quotationData = {
            ...data,
            documentId,
            documentNumber,
            customerSnapshot: { ...customer },
            jobSnapshot: {
              description: job.description,
              vehicleDetails: job.carServiceDetails?.licensePlate || job.commonrailDetails?.partNumber || ''
            },
            status: "DRAFT",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const quotationRef = doc(collection(db, "quotations"));
        batch.set(quotationRef, quotationData);

        // 3. Update Job Status if needed
        if (job.status === 'WAITING_QUOTATION') {
            const jobRef = doc(db, "jobs", jobId);
            batch.update(jobRef, { status: 'WAITING_APPROVE', lastActivityAt: serverTimestamp() });
        }

        await batch.commit();

        toast({ title: "Quotation Created", description: `Successfully created quotation ${documentNumber}` });
        router.push('/app/office/documents/quotation');

    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to create quotation", description: error.message });
    }
  };

  const isLoading = isLoadingJob || isLoadingStore || isLoadingDoc || isLoadingCustomer;

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!jobId) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>No Job ID provided. Please create a quotation from a job.</div>
  }
  
  if (jobError) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>Error loading job: {jobError.message}</div>
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> Back to Job</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
              Save Quotation
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
                 <h1 className="text-2xl font-bold text-right">ใบเสนอราคา</h1>
                 <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                 <FormField control={form.control} name="expiryDate" render={({ field }) => (<FormItem><FormLabel>ยืนราคาถึงวันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
            </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>ข้อมูลลูกค้า</CardTitle>
            </CardHeader>
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
            <CardHeader>
                <CardTitle>รายการ</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>รายละเอียด</TableHead>
                            <TableHead className="w-32 text-right">จำนวน</TableHead>
                            <TableHead className="w-40 text-right">ราคา/หน่วย</TableHead>
                            <TableHead className="w-40 text-right">ยอดรวม</TableHead>
                            <TableHead className="w-12"></TableHead>
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
                    <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{form.watch('subtotalAfterDiscount').toLocaleString()}</span></div>
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
      </form>
    </Form>
  );
}
