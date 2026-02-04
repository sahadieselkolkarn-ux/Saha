"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, serverTimestamp, updateDoc, where, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, AlertCircle, FileDown, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { createDocument } from "@/firebase/documents";
import type { Job, StoreSettings, Customer, Document as DocumentType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

const lineItemSchema = z.object({
  description: z.string().min(1, "ต้องกรอกรายละเอียด"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const quotationFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "Customer is required"),
  issueDate: z.string().min(1, "กรุณาเลือกวันที่"),
  expiryDate: z.string().min(1, "กรุณาเลือกวันที่"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  isVat: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  notes: z.string().optional(),
});

type QuotationFormData = z.infer<typeof quotationFormSchema>;

const formatCurrency = (value: number | null | undefined) => {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function QuotationForm({ jobId, editDocId }: { jobId: string | null, editDocId: string | null }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const isEditing = !!editDocId;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [quotationUsages, setQuotationUsages] = useState<number>(0);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "documents", editDocId) : null), [db, editDocId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      expiryDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      isVat: true,
      subtotal: 0,
      discountAmount: 0,
      net: 0,
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
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);

  const isCancelled = docToEdit?.status === 'CANCELLED';

  useEffect(() => {
    if (!db) return;
    setIsLoadingCustomers(true);
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลลูกค้าได้" });
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  useEffect(() => {
    const dataToLoad = docToEdit || job;
    if (dataToLoad) {
        let customerId = 
            (dataToLoad as any).customerId || 
            (dataToLoad as any).customerSnapshot?.id || 
            (dataToLoad as any).customerSnapshot?.customerId ||
            "";

        if (!customerId && dataToLoad.customerSnapshot?.name && dataToLoad.customerSnapshot?.phone) {
          const foundCustomer = customers.find(c => c.name === dataToLoad.customerSnapshot?.name && c.phone === dataToLoad.customerSnapshot?.phone);
          if (foundCustomer) {
            customerId = foundCustomer.id;
          }
        }
        
        const items = 'items' in dataToLoad && dataToLoad.items.length > 0
            ? dataToLoad.items.map(item => ({ ...item }))
            : [{ description: 'description' in dataToLoad ? (dataToLoad as any).description : '', quantity: 1, unitPrice: 0, total: 0 }];

        form.reset({
            jobId: 'jobId' in dataToLoad ? dataToLoad.jobId || undefined : jobId || undefined,
            customerId: customerId,
            issueDate: 'docDate' in dataToLoad ? dataToLoad.docDate : new Date().toISOString().split("T")[0],
            expiryDate: 'expiryDate' in dataToLoad && (dataToLoad as any).expiryDate ? (dataToLoad as any).expiryDate : new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split("T")[0],
            items: items,
            notes: 'notes' in dataToLoad ? dataToLoad.notes : '',
            isVat: 'withTax' in dataToLoad ? dataToLoad.withTax : true,
            discountAmount: 'discountAmount' in dataToLoad ? dataToLoad.discountAmount : 0,
            subtotal: 'subtotal' in dataToLoad ? dataToLoad.subtotal : 0,
            net: 'net' in dataToLoad ? dataToLoad.net : 0,
            vatAmount: 'vatAmount' in dataToLoad ? dataToLoad.vatAmount : 0,
            grandTotal: 'grandTotal' in dataToLoad ? dataToLoad.grandTotal : 0,
        });
    }
  }, [job, docToEdit, form, jobId, customers]);

  useEffect(() => {
    if (!db || !editDocId) {
      setQuotationUsages(0);
      return;
    }
    const q = query(collection(db, "documents"), where("referencesDocIds", "array-contains", editDocId));
    getDocs(q).then(snap => {
      setQuotationUsages(snap.size);
    });
  }, [db, editDocId]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
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

  const onSubmit = async (data: QuotationFormData) => {
    if (isCancelled) return;

    let customerSnapshot = customer ?? docToEdit?.customerSnapshot ?? job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "ไม่สามารถสร้างเอกสารได้" });
      return;
    }

    customerSnapshot = { ...customerSnapshot, id: data.customerId };

    const documentData = {
        customerId: data.customerId,
        docDate: data.issueDate,
        jobId: data.jobId,
        customerSnapshot: customerSnapshot,
        carSnapshot: (job || docToEdit?.jobId) ? { 
          licensePlate: job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate, 
          details: job?.description || docToEdit?.carSnapshot?.details 
        } : {},
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

    try {
        if (isEditing && editDocId) {
            const docRef = doc(db, 'documents', editDocId);
            await updateDoc(docRef, sanitizeForFirestore({
                ...documentData,
                updatedAt: serverTimestamp(),
            }));
            toast({ title: "อัปเดตใบเสนอราคาสำเร็จ" });
            router.push(`/app/office/documents/${editDocId}`);
        } else {
            const { docId } = await createDocument(
                db,
                'QUOTATION',
                documentData,
                profile,
                data.jobId ? 'WAITING_APPROVE' : undefined
            );
            toast({ title: "สร้างใบเสนอราคาสำเร็จ" });
            router.push(`/app/office/documents/${docId}`);
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };
  
  const isLoading = isLoadingStore || isLoadingJob || isLoadingDocToEdit || isLoadingCustomers || isLoadingCustomer;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
  const isCustomerSelectionDisabled = !!jobId || (isEditing && !!docToEdit?.customerId) || isCancelled;

  if (isLoading && !jobId && !editDocId) {
    return <Skeleton className="h-96" />;
  }
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {isCancelled && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>เอกสารถูกยกเลิก</AlertTitle>
            <AlertDescription>ใบเสนอราคานี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขข้อมูลได้</AlertDescription>
          </Alert>
        )}

        {quotationUsages > 0 && (
          <Alert variant="default" className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">ข้อมูลประวัติการใช้งาน</AlertTitle>
            <AlertDescription className="text-amber-700">
              ใบเสนอราคานี้ถูกนำไปอ้างอิงเพื่อออกเอกสารใบส่งของหรือใบกำกับภาษีแล้ว {quotationUsages} ครั้ง
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border rounded-lg bg-card">
            <div className="lg:col-span-2 space-y-2">
                <h2 className="text-xl font-bold">{storeSettings?.taxName || 'Sahadiesel Service'}</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{storeSettings?.taxAddress}</p>
                <p className="text-sm text-muted-foreground">โทร: {storeSettings?.phone}</p>
                <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {storeSettings?.taxId}</p>
            </div>
            <div className="space-y-4">
                 <h1 className="text-2xl font-bold text-right">ใบเสนอราคา</h1>
                 {isEditing && <p className="text-right text-sm font-mono">{docToEdit?.docNo}</p>}
                 <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} disabled={isCancelled} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="expiryDate" render={({ field }) => (<FormItem><FormLabel>ยืนราคาถึงวันที่</FormLabel><FormControl><Input type="date" {...field} disabled={isCancelled} /></FormControl><FormMessage /></FormItem>)} />
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
                        <FormLabel>ลูกค้า</FormLabel>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className={cn("w-full max-w-sm justify-between", !field.value && "text-muted-foreground")} disabled={isCustomerSelectionDisabled}>
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
                                    {filteredCustomers.length > 0 ? (
                                        filteredCustomers.map((c) => (
                                            <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3">
                                                <div className="flex flex-col items-start"><p>{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div>
                                            </Button>
                                        ))
                                    ) : (<p className="text-center p-4 text-sm text-muted-foreground">No customers found.</p>)}
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 {displayCustomer && (
                    <div className="mt-2 text-sm text-muted-foreground">
                        <p>{displayCustomer.taxAddress || displayCustomer.detail || 'N/A'}</p>
                        <p>โทร: {displayCustomer.phone}</p>
                        {displayCustomer.taxId && <p>เลขประจำตัวผู้เสียภาษี: {displayCustomer.taxId}</p>}
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
                                <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} placeholder="รายการสินค้า/บริการ" disabled={isCancelled} />)}/></TableCell>
                                <TableCell>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.quantity`}
                                    render={({ field }) => (
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="0"
                                        className="text-right"
                                        value={(field.value ?? 0) === 0 ? "" : field.value}
                                        onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }}
                                        onChange={(e) => {
                                          const newQuantity = e.target.value === '' ? 0 : Number(e.target.value);
                                          field.onChange(newQuantity);
                                          const unitPrice = form.getValues(`items.${index}.unitPrice`) || 0;
                                          form.setValue(`items.${index}.total`, newQuantity * unitPrice, { shouldValidate: true });
                                        }}
                                        disabled={isCancelled}
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
                                        disabled={isCancelled}
                                      />
                                    )}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isCancelled}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {!isCancelled && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>}
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Card>
                <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="notes" render={({ field }) => (<Textarea {...field} placeholder="เงื่อนไขการชำระเงิน หรืออื่นๆ" rows={5} disabled={isCancelled} />)} />
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
                                disabled={isCancelled}
                                />
                            )}
                        />
                    </div>
                    <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                    <div className="flex justify-between items-center">
                        <FormField control={form.control} name="isVat" render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isCancelled}/></FormControl>
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

        <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
            <Button type="submit" disabled={isFormLoading || isCancelled}>
              {isFormLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? 'บันทึกการแก้ไข' : 'บันทึกใบเสนอราคา'}
            </Button>
        </div>
      </form>
    </Form>
  );
}