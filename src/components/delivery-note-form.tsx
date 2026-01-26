
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs, orderBy } from "firebase/firestore";
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
  description: z.string().min(1, "ต้องกรอกรายละเอียด"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const deliveryNoteFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "Customer is required"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
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

type DeliveryNoteFormData = z.infer<typeof deliveryNoteFormSchema>;

const formatCurrency = (value: number | null | undefined) => {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DeliveryNoteForm({ jobId, editDocId }: { jobId: string | null, editDocId: string | null }) {
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

  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<DeliveryNoteFormData>({
    resolver: zodResolver(deliveryNoteFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      grandTotal: 0,
      notes: '',
      senderName: '',
      receiverName: '',
      isBackfill: false,
    },
  });

  const selectedCustomerId = form.watch('customerId');
  
  const customerDocRef = useMemo(() => {
    if (!db || !selectedCustomerId) return null;
    return doc(db, 'customers', selectedCustomerId);
  }, [db, selectedCustomerId]);

  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);
  
  const isLocked = isEditing && docToEdit?.status === 'PAID';

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "Failed to load customers" });
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db, toast]);
  
  useEffect(() => {
    if (!db || !jobId) {
        setQuotations([]);
        setSelectedQuotationId('');
        return;
    }
    
    const q = query(
        collection(db, "documents"),
        where("jobId", "==", jobId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allCustomerDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentType));
      const fetchedQuotations = allCustomerDocs.filter(doc => doc.docType === 'QUOTATION' && doc.status !== 'CANCELLED');
      
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
        items: docToEdit.items.map(item => ({...item})),
        notes: docToEdit.notes || '',
        senderName: (profile?.displayName || docToEdit.senderName) || '',
        receiverName: (docToEdit.customerSnapshot.name || docToEdit.receiverName) || '',
        discountAmount: docToEdit.discountAmount || 0,
        isBackfill: false,
      })
    } else if (job) {
        form.setValue('customerId', job.customerId);
        form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
        form.setValue('receiverName', job.customerSnapshot.name || '');
    }
    if (profile) {
        form.setValue('senderName', profile.displayName || '');
    }
  }, [job, docToEdit, profile, form]);
  
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const grandTotal = net;

    form.setValue("subtotal", subtotal, { shouldValidate: true });
    form.setValue("net", net, { shouldValidate: true });
    form.setValue("grandTotal", grandTotal, { shouldValidate: true });
  }, [watchedItems, watchedDiscount, form]);

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

  const onSubmit = async (data: DeliveryNoteFormData) => {
    if (isLocked) {
        toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: "เอกสารนี้ถูกยืนยันรายรับแล้ว" });
        return;
    }

    const customerSnapshot = customer ?? docToEdit?.customerSnapshot ?? job?.customerSnapshot;
    if (!db || !storeSettings || !profile || !customerSnapshot) {
        toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "ไม่สามารถสร้างเอกสารได้" });
        return;
    }

    const itemsForDoc = data.items.map(inv => ({
        description: inv.description,
        quantity: inv.quantity,
        unitPrice: inv.unitPrice,
        total: inv.total,
    }));

    try {
        const documentData = {
            docDate: data.issueDate,
            customerSnapshot: { ...customerSnapshot },
            storeSnapshot: { ...storeSettings },
            items: itemsForDoc,
            subtotal: data.subtotal, 
            discountAmount: data.discountAmount || 0,
            net: data.grandTotal,
            withTax: false,
            vatAmount: 0,
            grandTotal: data.grandTotal,
            notes: data.notes,
            dueDate: data.dueDate,
            senderName: data.senderName,
            receiverName: data.receiverName,
            jobId: data.jobId,
        };

        const backfillOptions = data.isBackfill ? { manualDocNo: data.manualDocNo } : undefined;
        const options = { ...backfillOptions, initialStatus: 'PENDING_REVIEW' };

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
                'DELIVERY_NOTE',
                documentData,
                profile,
                data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined,
                options
            );
            await ensurePaymentClaimForDocument(db, docId, profile);
            toast({ title: "บันทึกเอกสารแล้ว (รอตรวจสอบรายรับ)" });
        }
        router.push('/app/office/documents/delivery-note');

    } catch(error: any) {
         toast({ variant: "destructive", title: "Failed to create Delivery Note", description: error.message });
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomers || isLoadingCustomer || isLoadingDocToEdit;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;

  if (isLoading && !jobId && !editDocId) {
    return <Skeleton className="h-96" />;
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
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> Back</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || isLocked}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
              บันทึกและส่งตรวจ
            </Button>
        </div>
        
        <Card>
            <CardHeader><CardTitle className="text-base">1. เลือกลูกค้า</CardTitle></CardHeader>
            <CardContent>
                <FormField
                    name="customerId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className="w-full max-w-sm justify-between" disabled={!!jobId || !!editDocId || isLocked}>
                                {displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "เลือกลูกค้า..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <div className="p-2 border-b">
                                    <Input placeholder="Search..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                                </div>
                                <ScrollArea className="h-60">
                                    {filteredCustomers.map(c => (
                                        <Button variant="ghost" key={c.id} onClick={() => {field.onChange(c.id); setIsCustomerPopoverOpen(false);}} className="w-full justify-start">{c.name}</Button>
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
                    </>
                )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <CardTitle className="text-base">2. รายการสินค้า/บริการ</CardTitle>
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
                {jobId && quotations.length === 0 && !isLoading && (
                    <p className="text-muted-foreground text-sm mb-4">ไม่พบใบเสนอราคาสำหรับงานนี้</p>
                )}
                <div className="border rounded-md">
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="w-40 text-right">ยอดรวม</TableHead><TableHead className="w-12"/></TableRow></TableHeader>
                        <TableBody>
                            {fields.map((field, index) => (
                                <TableRow key={field.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} value={field.value ?? ''} placeholder="รายการสินค้า/บริการ" disabled={isLocked} />)}/></TableCell>
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
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})} disabled={isLocked}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
            </CardContent>
        </Card>

          <Card>
              <CardHeader><CardTitle className="text-base">3. หมายเหตุ และรายละเอียด</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                  <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea placeholder="เงื่อนไขการรับประกัน, เลขอะไหล่, หรือข้อมูลเพิ่มเติม" rows={4} {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่ส่งของ</FormLabel><FormControl><Input type="date" {...field} disabled={isLocked} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="discountAmount" render={({ field }) => (<FormItem><FormLabel>ส่วนลด</FormLabel><FormControl>
                          <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="text-right"
                                value={(field.value ?? 0) === 0 ? "" : field.value}
                                onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }}
                                onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                                disabled={isLocked}
                            />
                      </FormControl></FormItem>)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งของ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับของ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                  </div>
              </CardContent>
              <CardFooter className="flex-col items-end gap-2">
                  <div className="flex justify-between w-full max-w-xs">
                      <span className="text-muted-foreground">ยอดรวม:</span>
                      <span className="font-medium">{formatCurrency(form.watch('subtotal'))}</span>
                  </div>
                  <div className="flex justify-between w-full max-w-xs">
                      <span className="text-muted-foreground text-destructive">ส่วนลด:</span>
                      <span className="font-medium text-destructive">- {formatCurrency(form.watch('discountAmount'))}</span>
                  </div>
                  <Separator className="my-2 w-full max-w-xs" />
                  <div className="flex justify-between w-full max-w-xs text-lg font-bold">
                      <span>ยอดสุทธิ:</span>
                      <span>{formatCurrency(form.watch('grandTotal'))}</span>
                  </div>
              </CardFooter>
          </Card>

          <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={form.formState.isSubmitting}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
              <Button type="submit" disabled={isFormLoading || isLocked}>
                {isFormLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                บันทึกและส่งตรวจ
              </Button>
          </div>
        </form>
      </Form>
    </>
  )
}
