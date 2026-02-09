"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, FileDown, AlertTriangle, AlertCircle, Send } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

import { createDocument } from "@/firebase/documents";
import type { Job, StoreSettings, Customer, Document as DocumentType, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "@/components/ui/label";

const lineItemSchema = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียดรายการ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const taxInvoiceFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  issueDate: z.string().min(1, "กรุณาเลือกวันที่"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
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
  paymentTerms: z.enum(["CASH", "CREDIT"], { required_error: "กรุณาเลือกเงื่อนไขการชำระเงิน" }),
  suggestedPaymentMethod: z.enum(["CASH", "TRANSFER"]).optional(),
  suggestedAccountId: z.string().optional(),
  billingRequired: z.boolean().default(false),
}).superRefine((data, ctx) => {
    if (data.isBackfill && !data.manualDocNo) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "กรุณากรอกเลขที่เอกสารเดิม",
            path: ["manualDocNo"],
        });
    }
    if (data.paymentTerms === 'CASH' && !data.suggestedAccountId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "กรุณาเลือกบัญชีที่รับเงิน",
            path: ["suggestedAccountId"],
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
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [referencedQuotationId, setReferencedQuotationId] = useState<string | null>(null);
  const [quotationUsages, setQuotationUsages] = useState<number>(0);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingDn, setExistingDn] = useState<DocumentType | null>(null);
  const [showDnCancelDialog, setShowDnCancelDialog] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<TaxInvoiceFormData | null>(null);
  const [isReviewSubmission, setIsReviewSubmission] = useState(false);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "documents", editDocId) : null), [db, editDocId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<TaxInvoiceFormData>({
    resolver: zodResolver(taxInvoiceFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      isVat: true,
      isBackfill: false,
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      vatAmount: 0,
      grandTotal: 0,
      paymentTerms: 'CASH',
      suggestedPaymentMethod: 'CASH',
      billingRequired: false,
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const watchedPaymentTerms = form.watch('paymentTerms');
  
  const customerDocRef = useMemo(() => {
    if (!db || !selectedCustomerId) return null;
    return doc(db, 'customers', selectedCustomerId);
  }, [db, selectedCustomerId]);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);
  
  const isLocked = isEditing && docToEdit?.status === 'PAID';

  useEffect(() => {
    if (!db) return;
    const qCustomers = query(collection(db, "customers"));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลลูกค้าได้ กรุณาลองใหม่อีกครั้ง" });
      setIsLoadingCustomers(false);
    });

    const qAccounts = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    const unsubscribeAccounts = onSnapshot(qAccounts, (snapshot) => {
        setAccounts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AccountingAccount)));
    });

    return () => {
        unsubscribeCustomers();
        unsubscribeAccounts();
    };
  }, [db, toast]);
  
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
    if (!db || !selectedQuotationId) {
      setQuotationUsages(0);
      return;
    }
    const q = query(collection(db, "documents"), where("referencesDocIds", "array-contains", selectedQuotationId));
    getDocs(q).then(snap => {
      setQuotationUsages(snap.size);
    });
  }, [db, selectedQuotationId]);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        jobId: docToEdit.jobId || undefined,
        customerId: docToEdit.customerId || docToEdit.customerSnapshot?.id || "",
        issueDate: docToEdit.docDate,
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
        paymentTerms: docToEdit.paymentTerms || 'CASH',
        suggestedPaymentMethod: docToEdit.suggestedPaymentMethod || 'CASH',
        suggestedAccountId: docToEdit.suggestedAccountId || '',
        billingRequired: docToEdit.billingRequired || false,
      });
      if (docToEdit.referencesDocIds && docToEdit.referencesDocIds.length > 0) {
          setReferencedQuotationId(docToEdit.referencesDocIds[0]);
      }
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
    setReferencedQuotationId(selectedQuotationId);
  
    form.setValue('discountAmount', Number(quotation.discountAmount ?? 0), { shouldDirty: true, shouldValidate: true });
    form.setValue('isVat', quotation.withTax, { shouldDirty: true, shouldValidate: true });
  
    form.trigger(['items', 'discountAmount', 'isVat']);
  
    toast({
      title: "ดึงข้อมูลสำเร็จ",
      description: `ดึง ${itemsFromQuotation.length} รายการ จากใบเสนอราคาเลขที่ ${quotation.docNo}`,
    });
  };
  
  const executeSave = async (data: TaxInvoiceFormData, submitForReview: boolean) => {
    const customerSnapshot = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "ไม่สามารถบันทึกได้เนื่องจากข้อมูลลูกค้าหรือข้อมูลร้านค้าไม่สมบูรณ์" });
      return;
    }
    
    setIsSubmitting(true);

    const targetStatus = submitForReview ? 'PENDING_REVIEW' : 'DRAFT';
    const targetArStatus = submitForReview ? 'PENDING' : (isEditing ? docToEdit?.arStatus : null);
    const targetDispute = submitForReview ? null : (isEditing ? docToEdit?.dispute : null);

    const documentDataPayload = {
      customerId: data.customerId,
      docDate: data.issueDate,
      jobId: data.jobId,
      customerSnapshot: { ...customerSnapshot },
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
      senderName: data.senderName,
      receiverName: data.receiverName,
      paymentSummary: {
        paidTotal: 0,
        balance: data.grandTotal,
        paymentStatus: 'UNPAID' as 'UNPAID' | 'PARTIAL' | 'PAID',
      },
      paymentTerms: data.paymentTerms,
      suggestedPaymentMethod: data.suggestedPaymentMethod,
      suggestedAccountId: data.suggestedAccountId,
      billingRequired: data.billingRequired,
      arStatus: targetArStatus,
      dispute: targetDispute,
      referencesDocIds: referencedQuotationId ? [referencedQuotationId] : [],
    };

    try {
        let docId: string;
        const options = {
            ...(data.isBackfill && { manualDocNo: data.manualDocNo }),
            initialStatus: targetStatus,
        };
        
        if (isEditing && editDocId) {
            docId = editDocId;
            const docRef = doc(db, 'documents', docId);
            await updateDoc(docRef, sanitizeForFirestore({ 
                ...documentDataPayload, 
                status: targetStatus,
                updatedAt: serverTimestamp(),
                dispute: { isDisputed: false, reason: "" } // Clear dispute on re-submission
            }));
        } else {
            const result = await createDocument(
                db,
                'TAX_INVOICE',
                documentDataPayload,
                profile,
                data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined,
                options
            );
            docId = result.docId;
        }
        
        toast({ title: submitForReview ? "ส่งรายการตรวจสอบสำเร็จ" : "บันทึกฉบับร่างสำเร็จ" });
        router.push('/app/office/documents/tax-invoice');

    } catch (error: any) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSave = async (data: TaxInvoiceFormData, submitForReview: boolean) => {
    if (submitForReview) {
        setPendingData(data);
        setIsReviewSubmission(true);
        
        // Check for existing DN first
        if (!isEditing && data.jobId && db) {
            const q = query(
                collection(db, "documents"), 
                where("jobId", "==", data.jobId), 
                where("docType", "==", "DELIVERY_NOTE")
            );
            const snap = await getDocs(q);
            const activeDn = snap.docs.find(d => d.data().status !== 'CANCELLED');
            
            if (activeDn) {
                setExistingDn({ id: activeDn.id, ...activeDn.data() } as DocumentType);
                setShowDnCancelDialog(true);
                return;
            }
        }
        
        setShowReviewConfirm(true);
        return;
    }
    await executeSave(data, false);
  };

  const handleConfirmCancelAndSave = async () => {
    if (!db || !existingDn || !pendingData) return;
    try {
        const dnRef = doc(db, 'documents', existingDn.id);
        await updateDoc(dnRef, {
            status: 'CANCELLED',
            updatedAt: serverTimestamp(),
            notes: (existingDn.notes || "") + "\n[System] ยกเลิกเพื่อออกใบกำกับภาษีแทน",
        });
        toast({ title: "ยกเลิกใบส่งของชั่วคราวเดิมเรียบร้อย" });
        setShowDnCancelDialog(false);
        setShowReviewConfirm(true); // Now show the final review confirm
    } catch(e: any) {
        toast({ variant: 'destructive', title: "ยกเลิกไม่สำเร็จ", description: "เกิดข้อผิดพลาดในการยกเลิกใบเดิม กรุณาลองใหม่อีกครั้ง" });
    }
  };

  const isLoading = isLoadingStore || isLoadingJob || isLoadingDocToEdit || isLoadingCustomers || isLoadingCustomer;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
  const isCustomerSelectionDisabled = isLocked || !!jobId || (isEditing && !!docToEdit?.customerId);

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
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
            <div className="flex gap-2">
                <Button 
                    type="button" 
                    variant="secondary"
                    onClick={() => form.handleSubmit((data) => handleSave(data, false))()}
                    disabled={isFormLoading || isLocked}
                >
                    {isSubmitting && !isReviewSubmission ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    บันทึกฉบับร่าง
                </Button>
                <Button 
                    type="button"
                    onClick={() => form.handleSubmit((data) => handleSave(data, true))()}
                    disabled={isFormLoading || isLocked || docToEdit?.status === 'PENDING_REVIEW'}
                    title="ส่งเอกสารนี้ไปให้ฝ่ายบัญชีตรวจสอบและยืนยันก่อนปิดงาน"
                >
                    {isSubmitting && isReviewSubmission ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    ส่งบัญชีตรวจสอบ
                </Button>
            </div>
          </div>

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
                                  <FormLabel>บันทึกย้อนหลัง (Backfill)</FormLabel>
                                  <FormMessage/>
                              </div>
                              </FormItem>
                          )}
                      />
                  )}
                  {form.watch('isBackfill') ? (
                      <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่เอกสาร</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                          <FormField control={form.control} name="manualDocNo" render={({ field }) => (<FormItem><FormLabel>เลขที่เอกสารเดิม</FormLabel><FormControl><Input placeholder="เช่น INV2024-0001" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      </div>
                  ) : (
                      <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
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
                          <FormLabel>ชื่อลูกค้า</FormLabel>
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
                                      <Input autoFocus placeholder="พิมพ์ชื่อหรือเบอร์โทร..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                                  </div>
                                  <ScrollArea className="h-fit max-h-60">
                                      {filteredCustomers.length > 0 ? (
                                        filteredCustomers.map((c) => (
                                          <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3">
                                              <div className="text-left"><p>{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div>
                                          </Button>
                                          ))
                                      ) : (<p className="text-center p-4 text-sm text-muted-foreground">ไม่พบข้อมูลลูกค้า</p>)}
                                  </ScrollArea>
                              </PopoverContent>
                          </Popover>
                          </FormItem>
                      )}
                  />
                  {displayCustomer && (
                      <div className="mt-2 text-sm text-muted-foreground">
                          <p>{displayCustomer.taxAddress || 'ไม่มีข้อมูลที่อยู่'}</p>
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
                  <CardTitle className="text-base">รายการสินค้า/บริการ</CardTitle>
                  {jobId && quotations.length > 0 && (
                    <div className="flex flex-col gap-2">
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
                        <Button type="button" variant="outline" size="sm" onClick={handleFetchFromQuotation} disabled={!selectedQuotationId || isLocked}><FileDown className="mr-2 h-4 w-4"/> ดึงรายการ</Button>
                      </div>
                      {quotationUsages > 0 && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 p-1.5 rounded border border-amber-100">
                          <AlertTriangle className="h-3 w-3" />
                          ใบเสนอราคานี้เคยถูกนำไปออกเอกสารแล้ว {quotationUsages} ครั้ง
                        </div>
                      )}
                    </div>
                  )}
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>รายละเอียด</TableHead>
                              <TableHead className="w-32 text-right">จำนวน</TableHead>
                              <TableHead className="w-40 text-right">ราคา/หน่วย</TableHead>
                              <TableHead className="text-right">ยอดรวม</TableHead>
                              <TableHead/>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {fields.map((field, index) => (
                              <TableRow key={field.id}>
                                  <TableCell>{index + 1}</TableCell>
                                  <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} value={field.value ?? ''} placeholder="ชื่อรายการสินค้าหรือบริการ" disabled={isLocked}/>)}/></TableCell>
                                  <TableCell>
                                      <FormField
                                          control={form.control}
                                          name={`items.${index}.quantity`}
                                          render={({ field }) => ( <Input type="number" inputMode="decimal" placeholder="0" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }} onChange={(e) => { const newQuantity = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(newQuantity); const unitPrice = form.getValues(`items.${index}.unitPrice`) || 0; form.setValue(`items.${index}.total`, newQuantity * unitPrice, { shouldValidate: true }); }} disabled={isLocked} /> )}/>
                                  </TableCell>
                                  <TableCell>
                                      <FormField
                                          control={form.control}
                                          name={`items.${index}.unitPrice`}
                                          render={({ field }) => ( <Input type="number" inputMode="decimal" placeholder="0.00" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }} onChange={(e) => { const newPrice = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(newPrice); const quantity = form.getValues(`items.${index}.quantity`) || 0; form.setValue(`items.${index}.total`, newPrice * quantity, { shouldValidate: true }); }} disabled={isLocked} /> )}/>
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
                  <CardHeader><CardTitle>การชำระเงินและเงื่อนไข</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                       <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                            <FormItem>
                                <FormLabel>เงื่อนไขการชำระเงิน</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6 pt-2">
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="CASH" id="cash" disabled={isLocked} />
                                            <Label htmlFor="cash" className="cursor-pointer">เงินสด/โอน (Cash)</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="CREDIT" id="credit" disabled={isLocked} />
                                            <Label htmlFor="credit" className="cursor-pointer">เครดิต (Credit)</Label>
                                        </div>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {form.watch('paymentTerms') === 'CASH' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/30">
                                <FormField control={form.control} name="suggestedPaymentMethod" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>รูปแบบที่คาดว่าจะรับ</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger className="bg-background"><SelectValue/></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="CASH">เงินสด</SelectItem>
                                                <SelectItem value="TRANSFER">เงินโอน</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="suggestedAccountId" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>เข้าบัญชีที่รับเงิน (คาดการณ์)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription className="text-[10px]">บัญชีนี้เป็นข้อมูลที่ออฟฟิศระบุให้ฝ่ายบัญชีตรวจสอบภายหลัง สามารถแก้ไขได้ตอนยืนยัน</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                        )}

                       <FormField control={form.control} name="billingRequired" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-start space-x-3 space-y-0 rounded-md border p-4 h-fit">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked} /></FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel className="font-normal cursor-pointer">ต้องออกใบวางบิลรวม</FormLabel>
                                    <FormDescription>ติ๊กเฉพาะกรณีลูกค้ารายนี้ต้องออกใบวางบิลรวมภายหลัง (ลูกค้าเครดิต)</FormDescription>
                                </div>
                            </FormItem>
                        )} />
                       
                       <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุในเอกสาร</FormLabel><FormControl><Textarea placeholder="เช่น เงื่อนไขการรับประกัน, รายละเอียดเพิ่มเติม..." rows={3} disabled={isLocked}/></FormControl></FormItem>)} />
                  </CardContent>
              </Card>
              <div className="space-y-4">
                  <div className="space-y-2 p-4 border rounded-lg">
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">ส่วนลด</span>
                          <FormField control={form.control} name="discountAmount" render={({ field }) => ( <Input type="number" inputMode="decimal" placeholder="0.00" className="w-32 text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onFocus={(e) => { if (e.currentTarget.value === "0") e.currentTarget.value = ""; }} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} disabled={isLocked} /> )}/>
                      </div>
                      <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                      <div className="flex justify-between items-center">
                          <FormField control={form.control} name="isVat" render={({ field }) => (
                              <FormItem className="flex items-center gap-2 space-y-0">
                                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked}/></FormControl>
                                  <FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel>
                              </FormItem>
                          )}/>
                          <span>{formatCurrency(form.watch('vatAmount'))}</span>
                      </div>
                      <Separator/>
                      <div className="flex justify-between items-center text-lg font-bold"><span >ยอดรวมสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div>
                  </div>
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้มีอำนาจลงนาม (ฝ่ายร้าน)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับบริการ (ลูกค้า)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
          </div>
        </form>
      </Form>

      <AlertDialog open={showDnCancelDialog} onOpenChange={setShowDnCancelDialog}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>พบใบส่งของชั่วคราวเดิม</AlertDialogTitle>
                  <AlertDialogDescription>
                      งานซ่อมนี้มีใบส่งของชั่วคราวเลขที่ <span className="font-bold text-foreground">{existingDn?.docNo}</span> อยู่แล้ว
                      ต้องการยกเลิกใบส่งของเดิมเพื่อเปลี่ยนมาใช้ใบกำกับภาษีนี้แทนหรือไม่?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <Button variant="secondary" onClick={() => { setShowDnCancelDialog(false); setShowReviewConfirm(true); }} disabled={isSubmitting}>
                      ไม่ยกเลิก (ออกคู่กัน)
                  </Button>
                  <AlertDialogAction onClick={handleConfirmCancelAndSave} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "ยกเลิกใบเดิมและไปต่อ"}
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReviewConfirm} onOpenChange={setShowReviewConfirm}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการส่งให้ฝ่ายบัญชีตรวจสอบ?</AlertDialogTitle>
                  <AlertDialogDescription>
                      เมื่อส่งเรื่องให้ฝ่ายบัญชีตรวจสอบแล้ว <span className="font-bold text-destructive">คุณจะไม่สามารถแก้ไขเอกสารนี้ได้อีก</span> จนกว่าฝ่ายบัญชีจะกดยืนยันรายการหรือตีกลับมาให้แก้ไข
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { if(pendingData) executeSave(pendingData, true); }}>ตกลง ส่งตรวจสอบ</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
