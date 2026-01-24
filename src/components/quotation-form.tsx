
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, AlertCircle, ChevronsUpDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";

import { createDocument } from "@/firebase/documents";
import { sanitizeForFirestore } from "@/lib/utils";
import type { Job, StoreSettings, Customer } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const quotationFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "Customer is required"),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "At least one item is required."),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  isVat: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  notes: z.string().optional(),
});

type QuotationFormData = z.infer<typeof quotationFormSchema>;

export function QuotationForm({ jobId }: { jobId: string | null }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(!jobId);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob, error: jobError } = useDoc<Job>(jobDocRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      expiryDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      isVat: true,
      vatAmount: 0,
      grandTotal: 0,
      notes: "",
    },
  });

  const selectedCustomerId = form.watch('customerId');
  
  const customerDocRef = useMemo(() => {
    if (!db || !selectedCustomerId) return null;
    return doc(db, 'customers', selectedCustomerId);
  }, [db, selectedCustomerId]);
  const { data: customer } = useDoc<Customer>(customerDocRef);

  const jobCustomerDocRef = useMemo(() => {
    if (!db || !job?.customerId) return null;
    return doc(db, 'customers', job.customerId);
  }, [db, job?.customerId]);
  const { data: jobCustomer, isLoading: isLoadingJobCustomer } = useDoc<Customer>(jobCustomerDocRef);

  useEffect(() => {
    if (!jobId || !db) {
      setIsLoadingCustomers(false);
      return;
    };
    if (jobId) {
      setIsLoadingCustomers(false);
      return;
    }
    setIsLoadingCustomers(true);
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "Failed to load customers" });
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db, jobId, toast]);

  useEffect(() => {
    if (jobId && jobCustomer) {
      setCustomers([jobCustomer]);
    }
  }, [jobId, jobCustomer]);

  useEffect(() => {
    if (job) {
      form.setValue('customerId', job.customerId);
      form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
    }
  }, [job, form]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) {
      return customers;
    }
    const lowercasedFilter = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(lowercasedFilter) ||
        c.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

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
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal);
    form.setValue("net", net);
    form.setValue("vatAmount", vatAmount);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const onSubmit = async (data: QuotationFormData) => {
    const customerSnapshot = customer ?? jobCustomer ?? customers.find(c => c.id === selectedCustomerId) ?? (job ? { id: job.customerId, ...job.customerSnapshot } : null);

    if (!db || !customerSnapshot || !storeSettings || !profile) {
        toast({ variant: "destructive", title: "Missing critical data", description: "Cannot create quotation. Customer or store settings are missing." });
        return;
    }

    const carSnapshotData: { licensePlate?: string; details?: string; } = {};
    if (job) {
        if (job.carServiceDetails?.licensePlate) {
            carSnapshotData.licensePlate = job.carServiceDetails.licensePlate;
        }
        if (job.description) {
            carSnapshotData.details = job.description;
        }
    }

    try {
        const documentData = {
            docDate: data.issueDate,
            jobId: data.jobId,
            customerSnapshot: { ...customerSnapshot },
            carSnapshot: carSnapshotData,
            storeSnapshot: { ...storeSettings },
            items: data.items,
            subtotal: data.subtotal,
            discountAmount: data.discountAmount || 0,
            net: data.net,
            withTax: data.isVat,
            vatAmount: data.vatAmount,
            grandTotal: data.grandTotal,
            notes: data.notes,
            expiryDate: data.expiryDate,
        };

        const docNo = await createDocument(
            db,
            'QUOTATION',
            sanitizeForFirestore(documentData),
            profile,
            jobId ? 'WAITING_APPROVE' : undefined
        );

        toast({ title: "Quotation Created", description: `Successfully created quotation ${docNo}` });
        router.push('/app/office/documents/quotation');

    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to create quotation", description: error.message });
    }
  };
  
  const isLoading = isLoadingStore || (jobId ? isLoadingJob : isLoadingCustomers);
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer ?? jobCustomer ?? (job ? { id: job.customerId, ...job.customerSnapshot } : null);

  if (isLoading && (!jobId || isLoadingJob)) {
    return <Skeleton className="h-96" />;
  }
  
  if (jobId && jobError) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>Error loading job: {jobError.message}</div>
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
            <Button type="submit" disabled={isFormLoading}>
              {isFormLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
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
            <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
            <CardContent>
               <FormField
                    name="customerId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Customer</FormLabel>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className={cn("w-full max-w-sm justify-between", !field.value && "text-muted-foreground")} disabled={!!jobId}>
                                {displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "Select a customer..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <div className="p-2 border-b">
                                    <Input autoFocus placeholder="Search..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                                </div>
                                <ScrollArea className="h-fit max-h-60">
                                    {filteredCustomers.map((c) => (
                                    <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3">
                                        <div><p>{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div>
                                    </Button>
                                    ))}
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                        </FormItem>
                    )}
                    />
                 {displayCustomer && (
                    <>
                        <p className="text-sm text-muted-foreground mt-2">{displayCustomer.taxAddress || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">โทร: {displayCustomer.phone}</p>
                        <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {displayCustomer.taxId || 'N/A'}</p>
                    </>
                 )}
                 {job && (
                    <>
                        <Separator className="my-4" />
                        <p className="font-semibold">เรื่อง: {job.description}</p>
                        {job.carServiceDetails?.licensePlate && <p className="text-sm text-muted-foreground">ทะเบียนรถ: {job.carServiceDetails.licensePlate}</p>}
                    </>
                 )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>รายการ</CardTitle></CardHeader>
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
                                <TableCell className="text-right font-medium">{form.watch(`items.${index}.total`).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})}><PlusCircle className="mr-2 h-4 w-4"/> Add Item</Button>
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
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{form.watch('subtotal').toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">ส่วนลด</span><FormField control={form.control} name="discountAmount" render={({ field }) => (<Input type="number" {...field} className="w-32 text-right"/>)}/></div>
                    <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{form.watch('net').toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                    <div className="flex justify-between items-center">
                        <FormField control={form.control} name="isVat" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                <FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel>
                            </FormItem>
                        )}/>
                        <span>{form.watch('vatAmount').toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                     <Separator/>
                    <div className="flex justify-between items-center text-lg font-bold"><span >ยอดสุทธิ</span><span>{form.watch('grandTotal').toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                 </div>
            </div>
        </div>
      </form>
    </Form>
  );
}
