"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs, orderBy, writeBatch, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, FileDown, Search, AlertTriangle, AlertCircle, Send, FileSearch, FileStack } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { createDocument } from "@/firebase/documents";
import type { Job, StoreSettings, Customer, Document as DocumentType, AccountingAccount, DocType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { deptLabel } from "@/lib/ui-labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "@/components/ui/label";

const lineItemSchema = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียดรายการ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const deliveryNoteFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  issueDate: z.string().min(1, "กรุณาเลือกวันที่"),
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
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [referencedQuotationId, setReferencedQuotationId] = useState<string | null>(null);
  
  const [jobsReadyToBill, setJobsReadyToBill] = useState<Job[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isJobPopoverOpen, setIsJobPopoverOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewSubmission, setIsReviewSubmission] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<DeliveryNoteFormData | null>(null);

  // New Selection States
  const [isQtSearchOpen, setIsQtSearchOpen] = useState(false);
  const [qtSearchQuery, setQtSearchQuery] = useState("");
  const [allQuotations, setAllQuotations] = useState<DocumentType[]>([]);
  const [isSearchingQt, setIsSearchingQt] = useState(false);

  const [isBillSearchOpen, setIsBillSearchOpen] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [billSearchType, setBillSearchType] = useState<'DELIVERY_NOTE' | 'TAX_INVOICE'>('DELIVERY_NOTE');
  const [allBills, setAllBills] = useState<DocumentType[]>([]);
  const [isSearchingBills, setIsSearchingBills] = useState(false);

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
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      grandTotal: 0,
      notes: '',
      senderName: '',
      receiverName: '',
      isBackfill: false,
      paymentTerms: 'CASH',
      suggestedPaymentMethod: 'CASH',
      billingRequired: false,
    },
  });

  const currentJobId = form.watch('jobId');
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
    if (!db || jobId || isEditing) return;
    setIsLoadingJobs(true);
    const q = query(collection(db, "jobs"), where("status", "==", "DONE"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setJobsReadyToBill(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
        setIsLoadingJobs(false);
    });
    return () => unsubscribe();
  }, [db, jobId, isEditing]);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        jobId: docToEdit.jobId || undefined,
        customerId: docToEdit.customerId || docToEdit.customerSnapshot?.id || "",
        issueDate: docToEdit.docDate,
        items: docToEdit.items.map(item => ({...item})),
        notes: docToEdit.notes || '',
        senderName: (profile?.displayName || docToEdit.senderName) || '',
        receiverName: (docToEdit.customerSnapshot?.name || docToEdit.receiverName) || '',
        discountAmount: docToEdit.discountAmount || 0,
        isBackfill: false,
        paymentTerms: docToEdit.paymentTerms || 'CASH',
        suggestedPaymentMethod: docToEdit.suggestedPaymentMethod || 'CASH',
        suggestedAccountId: docToEdit.suggestedAccountId || '',
        billingRequired: docToEdit.billingRequired || false,
      });
      if (docToEdit.referencesDocIds && docToEdit.referencesDocIds.length > 0) {
          setReferencedQuotationId(docToEdit.referencesDocIds[0]);
      }
    } else if (job) {
        form.setValue('customerId', job.customerId);
        form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
        form.setValue('receiverName', job.customerSnapshot?.name || '');
    }
    if (profile) {
        form.setValue('senderName', profile.displayName || '');
    }
  }, [job, docToEdit, profile, form]);

  const filteredCustomers = useMemo(() => {
    const list = Array.isArray(customers) ? customers : [];
    const q = (customerSearch ?? "").trim().toLowerCase();
    if (!q) return list;
  
    return list.filter((c: any) => {
      const name = String(c.name ?? "").toLowerCase();
      const phone = String(c.phone ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [customers, customerSearch]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobsReadyToBill;
    return jobsReadyToBill.filter(j => 
        j.customerSnapshot.name.toLowerCase().includes(q) ||
        j.customerSnapshot.phone.includes(q) ||
        j.description.toLowerCase().includes(q)
    );
  }, [jobsReadyToBill, jobSearch]);
  
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

  const handleFetchFromDoc = async (sourceDoc: DocumentType) => {
    const itemsFromDoc = (sourceDoc.items || []).map((item: any) => {
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
  
    if (itemsFromDoc.length === 0) {
      toast({ variant: 'destructive', title: "เอกสารต้นทางไม่มีรายการ", description: `เลขที่ ${sourceDoc.docNo}` });
      return;
    }
  
    replace(itemsFromDoc);
    if (sourceDoc.docType === 'QUOTATION') {
        setReferencedQuotationId(sourceDoc.id);
    }
  
    form.setValue('discountAmount', Number(sourceDoc.discountAmount ?? 0), { shouldDirty: true, shouldValidate: true });
    form.setValue('customerId', sourceDoc.customerId || sourceDoc.customerSnapshot?.id || "");
    form.setValue('receiverName', sourceDoc.customerSnapshot?.name || "");
    
    if (currentJobId && sourceDoc.jobId !== currentJobId && db && profile) {
        try {
            const batch = writeBatch(db);
            const activityRef = doc(collection(db, 'jobs', currentJobId, 'activities'));
            batch.set(activityRef, {
                text: `ดึงข้อมูลจากเอกสารอื่น (${sourceDoc.docType}): ${sourceDoc.docNo}`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
            });
            await batch.commit();
        } catch (e) {
            console.error("Link error", e);
        }
    }
  
    form.trigger(['items', 'discountAmount', 'customerId']);
    toast({ title: "ดึงข้อมูลสำเร็จ", description: `ดึงจาก ${sourceDoc.docType} เลขที่ ${sourceDoc.docNo}` });
    setIsQtSearchOpen(false);
    setIsBillSearchOpen(false);
  };

  const loadAllDocs = async (type: DocType | 'BILLS') => {
    if (!db) return;
    if (type === 'QUOTATION') setIsSearchingQt(true); else setIsSearchingBills(true);
    
    try {
        if (type === 'QUOTATION') {
            const q = query(
                collection(db, "documents"),
                where("docType", "==", "QUOTATION"),
                limit(100)
            );
            const snap = await getDocs(q);
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType)).filter(d => d.status !== 'CANCELLED');
            items.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setAllQuotations(items);
        } else {
            const qDn = query(
                collection(db, "documents"),
                where("docType", "==", "DELIVERY_NOTE"),
                limit(100)
            );
            const qTi = query(
                collection(db, "documents"),
                where("docType", "==", "TAX_INVOICE"),
                limit(100)
            );
            const [snapDn, snapTi] = await Promise.all([getDocs(qDn), getDocs(qTi)]);
            const bills = [
                ...snapDn.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType)),
                ...snapTi.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType))
            ].filter(d => d.status !== 'CANCELLED');
            bills.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setAllBills(bills);
        }
    } catch (e: any) {
        console.error(e);
        toast({ variant: 'destructive', title: "ค้นหาล้มเหลว", description: e.message });
    } finally {
        if (type === 'QUOTATION') setIsSearchingQt(false); else setIsSearchingBills(false);
    }
  };

  const handleSelectJob = (job: Job) => {
    form.setValue('jobId', job.id);
    form.setValue('customerId', job.customerId);
    form.setValue('receiverName', job.customerSnapshot.name);
    form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
    setIsJobPopoverOpen(false);
    toast({ title: "อ้างอิงงานซ่อมแล้ว", description: `เลือกงานของ ${job.customerSnapshot.name}` });
  };

  const executeSave = async (data: DeliveryNoteFormData, submitForReview: boolean) => {
    const customerSnapshot = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "กรุณากรอกข้อมูลลูกค้าและร้านค้าให้ครบถ้วน" });
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
      carSnapshot: (data.jobId || docToEdit?.jobId) ? { 
          licensePlate: job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate || jobsReadyToBill.find(j=>j.id===data.jobId)?.carServiceDetails?.licensePlate, 
          details: job?.description || docToEdit?.carSnapshot?.details || jobsReadyToBill.find(j=>j.id===data.jobId)?.description
      } : {},
      storeSnapshot: { ...storeSettings },
      items: data.items,
      subtotal: data.subtotal,
      discountAmount: data.discountAmount || 0,
      net: data.net,
      withTax: false,
      vatAmount: 0,
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
                dispute: { isDisputed: false, reason: "" } 
            }));
        } else {
            const result = await createDocument(
                db, 
                'DELIVERY_NOTE', 
                documentDataPayload, 
                profile, 
                data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined,
                options
            );
            docId = result.docId;
        }
        
        toast({ title: submitForReview ? "ส่งรายการตรวจสอบสำเร็จ" : "บันทึกฉบับร่างสำเร็จ" });
        router.push('/app/office/documents/delivery-note');

    } catch (error: any) {
        toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSave = async (data: DeliveryNoteFormData, submitForReview: boolean) => {
    if (submitForReview) {
        setPendingFormData(data);
        setIsReviewSubmission(true);
        setShowReviewConfirm(true);
        return;
    }
    await executeSave(data, false);
  };

  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomers || isLoadingCustomer || isLoadingDocToEdit;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
  const isCustomerSelectionDisabled = isLocked || !!currentJobId || (isEditing && !!docToEdit?.customerId);

  const getFilteredDocs = (docs: DocumentType[], queryStr: string, typeFilter?: 'DELIVERY_NOTE' | 'TAX_INVOICE') => {
    const q = queryStr.toLowerCase().trim();
    let filtered = [...docs];
    if (typeFilter) {
        filtered = filtered.filter(d => d.docType === typeFilter);
    }
    if (!q) return filtered;
    return filtered.filter(d => 
        d.docNo.toLowerCase().includes(q) ||
        (d.customerSnapshot?.name || "").toLowerCase().includes(q) ||
        (d.customerSnapshot?.phone || "").includes(q)
    );
  };

  if (isLoading && !jobId && !editDocId) {
    return <Skeleton className="h-96" />;
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {isLocked && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>เอกสารถูกยกเลิก</AlertTitle>
            <AlertDescription>
              เอกสารนี้ถูกยืนยันรายการขายแล้ว จึงไม่สามารถแก้ไขได้
            </AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> ย้อนกลับ</Button>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                  <CardHeader><CardTitle className="text-base">1. ข้อมูลลูกค้า</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      {!jobId && !isEditing && (
                          <div className="space-y-2">
                              <Label>อ้างอิงจากงานซ่อมที่ทำเสร็จแล้ว (Job DONE)</Label>
                              <Popover open={isJobPopoverOpen} onOpenChange={setIsJobPopoverOpen}>
                                  <PopoverTrigger asChild>
                                      <Button variant="outline" className="w-full justify-between font-normal text-left">
                                          <span className="truncate">{currentJobId ? `งาน ID: ${currentJobId.substring(0,8)}...` : "เลือกงานซ่อมที่รอทำบิล..."}</span>
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                      </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                      <div className="p-2 border-b">
                                          <div className="relative">
                                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                              <Input placeholder="ค้นหาชื่องาน, ลูกค้า, เบอร์โทร..." value={jobSearch} onChange={e => setJobSearch(e.target.value)} className="pl-8" />
                                          </div>
                                      </div>
                                      <ScrollArea className="h-60">
                                          {isLoadingJobs ? <div className="p-4 text-center"><Loader2 className="animate-spin inline mr-2"/>กำลังโหลด...</div> : 
                                           filteredJobs.length > 0 ? filteredJobs.map(j => (
                                              <Button variant="ghost" key={j.id} onClick={() => handleSelectJob(j)} className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none text-left">
                                                  <div className="text-left">
                                                      <p className="font-semibold">{j.customerSnapshot.name} ({j.customerSnapshot.phone})</p>
                                                      <p className="text-xs text-muted-foreground line-clamp-1">{j.description}</p>
                                                      <p className="text-[10px] text-muted-foreground">ID: {j.id.substring(0,8)}... • {deptLabel(j.department)}</p>
                                                  </div>
                                              </Button>
                                          )) : <div className="p-4 text-center text-sm text-muted-foreground">ไม่พบงานที่รอทำบิล</div>}
                                      </ScrollArea>
                                  </PopoverContent>
                              </Popover>
                          </div>
                      )}

                      <FormField
                          name="customerId"
                          control={form.control}
                          render={({ field }) => (
                              <FormItem>
                              <FormLabel>ชื่อลูกค้า</FormLabel>
                              <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                                  <PopoverTrigger asChild>
                                  <FormControl>
                                      <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")} disabled={isCustomerSelectionDisabled}>
                                      <span className="truncate">{displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "เลือกลูกค้า..."}</span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                      </Button>
                                  </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                      <div className="p-2 border-b">
                                          <Input placeholder="ค้นหาชื่อ หรือเบอร์โทร..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                                      </div>
                                      <ScrollArea className="h-60">
                                          {filteredCustomers.map(c => (
                                              <Button variant="ghost" key={c.id} onClick={() => {field.onChange(c.id); setIsCustomerPopoverOpen(false);}} className="w-full justify-start">{c.name}</Button>
                                          ))}
                                      </ScrollArea>
                                  </PopoverContent>
                              </Popover>
                              <FormMessage />
                              </FormItem>
                          )}
                      />
                      {displayCustomer && (
                          <div className="text-sm p-3 bg-muted/50 rounded-md">
                              <p className="font-medium">{displayCustomer.name}</p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{displayCustomer.taxAddress || displayCustomer.detail || 'ไม่มีที่อยู่'}</p>
                              <p className="text-muted-foreground">โทร: {displayCustomer.phone}</p>
                          </div>
                      )}
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader><CardTitle className="text-base">2. การชำระเงิน</CardTitle></CardHeader>
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

                      {watchedPaymentTerms === 'CASH' && (
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
                                    <FormLabel>เข้าบัญชี (คาดการณ์)</FormLabel>
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
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked} /></FormControl>
                              <div className="space-y-1 leading-none">
                                  <FormLabel className="cursor-pointer">ต้องออกใบวางบิลรวม</FormLabel>
                                  <FormDescription>ติ๊กเฉพาะกรณีลูกค้ารายนี้ต้องออกใบวางบิลรวมภายหลัง (ลูกค้าเครดิต)</FormDescription>
                              </div>
                          </FormItem>
                      )} />
                  </CardContent>
              </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center gap-4 py-3">
                    <CardTitle className="text-base whitespace-nowrap">3. รายการสินค้า/บริการ</CardTitle>
                    <div className="flex gap-2">
                        <Popover open={isQtSearchOpen} onOpenChange={setIsQtSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => loadAllDocs('QUOTATION')} disabled={isLocked}>
                                    <FileSearch className="mr-2 h-3 w-3" /> เลือกจากใบเสนอราคา
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0" align="start">
                                <div className="p-2 border-b">
                                    <Input 
                                        placeholder="ค้นหาเลขที่, ชื่อ, เบอร์โทร..." 
                                        value={qtSearchQuery} 
                                        onChange={e => setQtSearchQuery(e.target.value)} 
                                        autoFocus
                                    />
                                </div>
                                <ScrollArea className="h-60">
                                    {isSearchingQt ? (
                                        <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline mr-2"/>กำลังค้นหา...</div>
                                    ) : getFilteredDocs(allQuotations, qtSearchQuery).length > 0 ? (
                                        getFilteredDocs(allQuotations, qtSearchQuery).map(q => (
                                            <Button 
                                                key={q.id} 
                                                variant="ghost" 
                                                className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none text-left"
                                                onClick={() => handleFetchFromDoc(q)}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{q.docNo}</span>
                                                    <span className="text-[10px] text-muted-foreground">{q.customerSnapshot?.name} • {q.customerSnapshot?.phone}</span>
                                                    <span className="text-[10px] text-muted-foreground">{safeFormat(new Date(q.docDate), 'dd/MM/yy')} • ฿{formatCurrency(q.grandTotal)}</span>
                                                </div>
                                            </Button>
                                        ))
                                    ) : (
                                        <p className="p-4 text-center text-sm text-muted-foreground">ไม่พบเอกสาร</p>
                                    )}
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>

                        <Popover open={isBillSearchOpen} onOpenChange={setIsBillSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => loadAllDocs('BILLS')} disabled={isLocked}>
                                    <FileStack className="mr-2 h-3 w-3" /> เลือกจากบิลขาย
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0" align="start">
                                <Tabs value={billSearchType} onValueChange={(v: any) => setBillSearchType(v)} className="w-full">
                                    <TabsList className="w-full rounded-none h-10">
                                        <TabsTrigger value="DELIVERY_NOTE" className="flex-1 text-[10px]">ใบส่งของชั่วคราว</TabsTrigger>
                                        <TabsTrigger value="TAX_INVOICE" className="flex-1 text-[10px]">ใบกำกับภาษี</TabsTrigger>
                                    </TabsList>
                                    <div className="p-2 border-b">
                                        <Input 
                                            placeholder="ค้นหาเลขที่, ชื่อ, เบอร์โทร..." 
                                            value={billSearchQuery} 
                                            onChange={e => setBillSearchQuery(e.target.value)} 
                                            autoFocus
                                        />
                                    </div>
                                    <ScrollArea className="h-60">
                                        {isSearchingBills ? (
                                            <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline mr-2"/>กำลังโหลด...</div>
                                        ) : getFilteredDocs(allBills, billSearchQuery, billSearchType).length > 0 ? (
                                            getFilteredDocs(allBills, billSearchQuery, billSearchType).map(d => (
                                                <Button 
                                                    key={d.id} 
                                                    variant="ghost" 
                                                    className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none text-left"
                                                    onClick={() => handleFetchFromDoc(d)}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{d.docNo}</span>
                                                        <span className="text-[10px] text-muted-foreground">{d.customerSnapshot?.name} • {d.customerSnapshot?.phone}</span>
                                                        <span className="text-[10px] text-muted-foreground">{safeFormat(new Date(d.docDate), 'dd/MM/yy')} • ฿{formatCurrency(d.grandTotal)}</span>
                                                    </div>
                                                </Button>
                                            ))
                                        ) : (
                                            <p className="p-4 text-center text-sm text-muted-foreground">ไม่พบเอกสาร</p>
                                        )}
                                    </ScrollArea>
                                </Tabs>
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-12 text-center">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="w-40 text-right">ยอดรวม</TableHead><TableHead className="w-12"/></TableRow></TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                        <TableCell className="text-center">{index + 1}</TableCell>
                                        <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} value={field.value ?? ''} placeholder="ชื่อสินค้าหรือบริการ" disabled={isLocked} />)}/></TableCell>
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
                  <CardHeader><CardTitle className="text-base">4. หมายเหตุ และรายละเอียดส่งมอบ</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุในเอกสาร</FormLabel><FormControl><Textarea placeholder="เช่น เงื่อนไขการรับประกัน, เลขอะไหล่ที่เปลี่ยน..." rows={4} {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่ออกใบส่งของ</FormLabel><FormControl><Input type="date" {...field} disabled={isLocked} /></FormControl></FormItem>)} />
                          <FormField control={form.control} name="discountAmount" render={({ field }) => (<FormItem><FormLabel>ส่วนลด (บาท)</FormLabel><FormControl>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งของ (ฝ่ายร้าน)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                          <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับของ (ลูกค้า)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
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
                      <Separator className="my-1 w-full max-w-xs" />
                      <div className="flex justify-between w-full max-w-xs text-lg font-bold text-primary">
                          <span>ยอดสุทธิ:</span>
                          <span>{formatCurrency(form.watch('grandTotal'))}</span>
                      </div>
                  </CardFooter>
              </Card>
          </form>
        </Form>
      </div>

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
                  <AlertDialogAction onClick={() => { if(pendingFormData) executeSave(pendingFormData, true); }}>ตกลง ส่งตรวจสอบ</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
