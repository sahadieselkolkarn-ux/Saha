
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, AlertCircle, ChevronsUpDown, FileDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { createDocument } from "@/firebase/documents";
import { ensurePaymentClaimForDocument } from "@/firebase/payment-claims";
import { sanitizeForFirestore } from "@/lib/utils";
import type { Job, StoreSettings, Customer, Document as DocumentType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const taxInvoiceFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "Customer is required"),
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
  isBackfill: z.boolean().default(false),
  manualDocNo: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.isBackfill && !data.manualDocNo) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "กรุณากรอกเลขที่เอกสารเดิม",
            path: ["manualDocNo"],
        });
    }
});

type TaxInvoiceFormData = z.infer<typeof taxInvoiceFormSchema>;

const formatCurrency = (value: number | null | undefined) => {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function TaxInvoiceForm({ jobId, editDocId }: { jobId: string | null, editDocId: string | null }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const isEditing = !!editDocId;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<DocumentType[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  
  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "documents", editDocId) : null), [db, editDocId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob, error: jobError } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<TaxInvoiceFormData>({
    resolver: zodResolver(taxInvoiceFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      isVat: true,
      isBackfill: false,
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      vatAmount: 0,
      grandTotal: 0,
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const isBackfill = form.watch('isBackfill');
  
  const customerDocRef = useMemo(() => {
    if (!db || !selectedCustomerId) return null;
    return doc(db, 'customers', selectedCustomerId);
  }, [db, selectedCustomerId]);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);
  
  const isLocked = isEditing && docToEdit?.status === 'PAID';

  useEffect(() => {
    if (jobId || editDocId || !db) {
      setIsLoadingCustomers(false);
      return;
    };
    
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
  }, [db, jobId, editDocId, toast]);
  
  useEffect(() => {
    if (!db || !jobId) {
      setQuotations([]);
      return;
    };
    
    const q = query(
      collection(db, 'documents'),
      where('jobId', '==', jobId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedQuotations = snapshot.docs
          .map(d => ({id: d.id, ...d.data()}) as DocumentType)
          .filter(d => d.docType === 'QUOTATION' && d.status !== 'CANCELLED');
        fetchedQuotations.sort((a,b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime());
        setQuotations(fetchedQuotations);
        if (fetchedQuotations.length > 0) {
            setSelectedQuotationId(fetchedQuotations[0].id);
        }
    });
    return () => unsubscribe();

  }, [db, jobId]);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        jobId: docToEdit.jobId || undefined,
        customerId: docToEdit.customerSnapshot.id,
        issueDate: docToEdit.docDate,
        dueDate: docToEdit.dueDate || new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split("T")[0],
        items: docToEdit.items.map(item => ({...item})),
        notes: docToEdit.notes ?? '',
        isVat: docToEdit.withTax,
        discountAmount: docToEdit.discountAmount || 0,
        senderName: profile?.displayName || docToEdit.senderName,
        receiverName: docToEdit.customerSnapshot.name || docToEdit.receiverName,
        isBackfill: false,
        subtotal: docToEdit.subtotal || 0,
        net: docToEdit.net || 0,
        vatAmount: docToEdit.vatAmount || 0,
        grandTotal: docToEdit.grandTotal || 0,
      });
    } else if (job) {
      const defaultItem = { description: job.description, quantity: 1, unitPrice: 0, total: 0 };
      if (job.technicalReport) {
        form.setValue('items', [{ ...defaultItem, description: job.technicalReport }]);
      } else {
        form.setValue('items', [defaultItem]);
      }
      form.setValue('customerId', job.customerId);
      form.setValue('receiverName', job.customerSnapshot.name ?? '');
    }
     if (profile) {
      form.setValue('senderName', profile.displayName ?? '');
    }
  }, [job, docToEdit, profile, form]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });
  const watchedIsVat = useWatch({ control: form.control, name: "isVat" });

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal, { shouldValidate: true });
    form.setValue("net", net, { shouldValidate: true });
    form.setValue("vatAmount", vatAmount, { shouldValidate: true });
    form.setValue("grandTotal", grandTotal, { shouldValidate: true });
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const handleFetchFromQuotation = () => {
    const quotation = quotations.find(q => q.id === selectedQuotationId);
    if (!quotation) {
      toast({ variant: 'destructive', title: "กรุณาเลือกใบเสนอราคา" });
      return;
    }
  
    const itemsFromQuotation = (quotation.items || []).map((item: any) => {
      const qty = Number(item.quantity ?? 1);
      const price = Number(item.unitPrice ?? 0);
      const total = Number(item.total ?? (qty * price));
      return {
        description: String(item.description ?? ''),
        quantity: qty,
        unitPrice: price,
        total,
      };
    });
  
    if (itemsFromQuotation.length === 0) {
      toast({ variant: 'destructive', title: "ใบเสนอราคาไม่มีรายการ", description: `เลขที่ ${quotation.docNo}` });
      return;
    }
  
    replace(itemsFromQuotation);
  
    form.setValue('discountAmount', Number(quotation.discountAmount ?? 0), { shouldDirty: true, shouldValidate: true });
  
    form.trigger(['items', 'discountAmount']);
  
    toast({
      title: "ดึงข้อมูลสำเร็จ",
      description: `ดึง ${itemsFromQuotation.length} รายการ จากใบเสนอราคาเลขที่ ${quotation.docNo}`,
    });
  };

  const onSubmit = async (data: TaxInvoiceFormData) => {
    if (isLocked) {
        toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: "เอกสารนี้ถูกยืนยันรายรับแล้ว" });
        return;
    }

    const customerSnapshot = customer ?? docToEdit?.customerSnapshot ?? job?.customerSnapshot;
    
    if (!db || !customerSnapshot || !storeSettings || !profile) {
        toast({ variant: "destructive", title: "Missing data for invoice creation." });
        return;
    }

    const documentData = {
        docDate: data.issueDate,
        jobId: data.jobId,
        customerSnapshot: { ...customerSnapshot },
        carSnapshot: {
            licensePlate: job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate,
            details: job?.description || docToEdit?.carSnapshot?.details
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

    const backfillOptions = data.isBackfill ? { manualDocNo: data.manualDocNo } : undefined;
    const options = { ...backfillOptions, initialStatus: 'PENDING_REVIEW' };
    
    try {
        if (isEditing && editDocId) {
            const docRef = doc(db, 'documents', editDocId);
            await updateDoc(docRef, sanitizeForFirestore({
                ...documentData,
                status: 'PENDING_REVIEW',
                updatedAt: serverTimestamp(),
            }));
            await ensurePaymentClaimForDocument(db, editDocId, profile);
            toast({ title: "บันทึกเอกสารแล้ว (รอตรวจสอบรายรับ)" });
        } else {
            const { docId } = await createDocument(
                db,
                'TAX_INVOICE',
                documentData,
                profile,
                data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined,
                options
            );
            await ensurePaymentClaimForDocument(db, docId, profile);
            toast({ title: "บันทึกเอกสารแล้ว (รอตรวจสอบรายรับ)" });
        }
        router.push('/app/office/documents/tax-invoice');
    } catch (error: any) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };
  
  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomer || isLoadingDocToEdit;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;

  if (isLoading && !jobId && !editDocId) {
    return <Skeleton className="h-96" />;
  }
  
  if (jobError) {
      return <div className="text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>Error loading job: {jobError.message}</div>
  }

  return (
    <>
      {isLocked && (
          <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>เอกสารถูกล็อก</AlertTitle>
              <AlertDescription>
                  เอกสารนี้ถูกยืนยันรายรับแล้ว จึงไม่สามารถแก้ไขได้
              </AlertDescription>
          </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        <Card>
            <CardHeader><CardTitle className="text-base">ข้อมูลทั่วไป</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {!isEditing && (
                    <FormField
                        control={form.control}
                        name="isBackfill"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isLocked}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                บันทึกย้อนหลัง (Backfill)
                                </FormLabel>
                                <FormDescription>
                                ใช้สำหรับคีย์เอกสารย้อนหลังจากสมุด/ระบบเก่า
                                </FormDescription>
                            </div>
                            </FormItem>
                        )}
                    />
                )}
                {isBackfill ? (
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่เอกสาร</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="manualDocNo" render={({ field }) => (<FormItem><FormLabel>เลขที่เอกสารเดิม</FormLabel><FormControl><Input placeholder="เช่น INV2024-0001" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>ครบกำหนดชำระ</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                    </div>
                )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
            <CardContent>
                <FormField
                    name="customerId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>ลูกค้า</FormLabel>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className={cn("w-full max-w-sm justify-between", !field.value && "text-muted-foreground")} disabled={!!jobId || !!editDocId || isLocked}>
                                {displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "เลือกลูกค้า..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <div className="p-2 border-b">
                                    <Input autoFocus placeholder="ค้นหา..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
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
                    <div className="mt-2 text-sm text-muted-foreground">
                        <p>{displayCustomer.taxAddress || 'N/A'}</p>
                        <p>โทร: {displayCustomer.phone}</p>
                        <p>เลขประจำตัวผู้เสียภาษี: {displayCustomer.taxId || 'N/A'}</p>
                    </div>
                 )}
                 {(job || docToEdit?.jobId) && (
                    <>
                        <Separator className="my-4" />
                        <p className="font-semibold">เรื่อง: {job?.description || docToEdit?.carSnapshot?.details}</p>
                        {(job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate) && <p className="text-sm text-muted-foreground">ทะเบียนรถ: {job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate}</p>}
                    </>
                 )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <CardTitle className="text-base">รายการ</CardTitle>
                {jobId && quotations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedQuotationId} onValueChange={setSelectedQuotationId} disabled={isLocked}>
                      <SelectTrigger className="w-full sm:w-[280px]">
                          <SelectValue placeholder="เลือกใบเสนอราคา..." />
                      </SelectTrigger>
                      <SelectContent>
                          {quotations.map(q => (
                              <SelectItem key={q.id} value={q.id}>
                                  {q.docNo} ({safeFormat(new Date(q.docDate), 'dd/MM/yy')})
                              </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" onClick={handleFetchFromQuotation} disabled={!selectedQuotationId || isLocked}><FileDown/> ดึงรายการ</Button>
                  </div>
                )}
            </CardHeader>
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
                                <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} value={field.value ?? ''} placeholder="Service or product" disabled={isLocked}/>)}/></TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.quantity`}
                                        render={({ field }) => (
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="—"
                                            className="text-right"
                                            value={(field.value ?? 0) === 0 ? "" : field.value}
                                            onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }}
                                            onChange={(e) => {
                                                const newQuantity = e.target.value === '' ? 0 : Number(e.target.value);
                                                field.onChange(newQuantity);
                                                const unitPrice = form.getValues(`items.${index}.unitPrice`) || 0;
                                                form.setValue(`items.${index}.total`, newQuantity * unitPrice, { shouldValidate: true });
                                            }}
                                            disabled={isLocked}
                                        />
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.unitPrice`}
                                        render={({ field }) => (
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            className="text-right"
                                            value={(field.value ?? 0) === 0 ? "" : field.value}
                                            onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }}
                                            onChange={(e) => {
                                                const newPrice = e.target.value === '' ? 0 : Number(e.target.value);
                                                field.onChange(newPrice);
                                                const quantity = form.getValues(`items.${index}.quantity`) || 0;
                                                form.setValue(`items.${index}.total`, newPrice * quantity, { shouldValidate: true });
                                            }}
                                            disabled={isLocked}
                                        />
                                        )}
                                    />
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isLocked}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})} disabled={isLocked}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="notes" render={({ field }) => (<Textarea {...field} value={field.value ?? ''} placeholder="เงื่อนไขการชำระเงิน หรืออื่นๆ" rows={5} disabled={isLocked}/>)} />
                </CardContent>
            </Card>
            <div className="space-y-4">
                 <div className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">ส่วนลด</span>
                        <FormField
                            control={form.control}
                            name="discountAmount"
                            render={({ field }) => (
                                <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="w-32 text-right"
                                value={(field.value ?? 0) === 0 ? "" : field.value}
                                onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }}
                                onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                                disabled={isLocked}
                                />
                            )}
                        />
                    </div>
                    <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                    <div className="flex justify-between items-center">
                        <FormField control={form.control} name="isVat" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={true}/></FormControl>
                                <FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel>
                            </FormItem>
                        )}/>
                        <span>{formatCurrency(form.watch('vatAmount'))}</span>
                    </div>
                    <Separator/>
                    <div className="flex justify-between items-center text-lg font-bold"><span >ยอดสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div>
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้มีอำนาจ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับบริการ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
        </div>
        <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={form.formState.isSubmitting}><ArrowLeft className="mr-2 h-4 w-4" /> กลับ</Button>
            <Button type="submit" disabled={isFormLoading || isLocked}>
              {isFormLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              บันทึกและส่งตรวจ
            </Button>
        </div>
      </form>
    </Form>
    </>
  );
}
