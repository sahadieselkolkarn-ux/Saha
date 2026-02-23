"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs, writeBatch, limit, getDoc, deleteField, setDoc } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Trash2, PlusCircle, ArrowLeft, ChevronsUpDown, FileSearch, FileStack, AlertCircle, Send, Search, Wallet, Eye, XCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { createDocument } from "@/firebase/documents";
import { archiveAndCloseJob } from "@/firebase/jobs-archive";
import type { Job, StoreSettings, Customer, Document as DocumentType, AccountingAccount, DocType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

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
  paymentTerms: z.enum(["CASH", "CREDIT"]).optional(),
  suggestedPaymentMethod: z.enum(["CASH", "TRANSFER"]).optional(),
  suggestedAccountId: z.string().optional(),
  billingRequired: z.boolean().default(false),
  dueDate: z.string().optional().nullable(),
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

  // Uniqueness check states
  const [existingActiveDoc, setExistingActiveDoc] = useState<DocumentType | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Suggested submission states
  const [suggestedPayments, setSuggestedPayments] = useState<{method: 'CASH' | 'TRANSFER', accountId: string, amount: number}[]>([{method: 'CASH', accountId: '', amount: 0}]);
  const [submitBillingRequired, setSubmitBillingRequired] = useState(false);
  const [submitDueDate, setSubmitDueDate] = useState('');
  const [recordRemainingAsCredit, setRecordRemainingAsCredit] = useState(false);

  const [selectedLinkDoc, setSelectedLinkDoc] = useState<DocumentType | null>(null);
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);

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
  const grandTotal = form.watch('grandTotal');
  
  const customerDocRef = useMemo(() => db && selectedCustomerId ? doc(db, 'customers', selectedCustomerId) : null, [db, selectedCustomerId]);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);
  
  const isLocked = isEditing && (docToEdit?.status === 'PAID' || docToEdit?.status === 'PENDING_REVIEW') && profile?.role !== 'ADMIN' && profile?.role !== 'MANAGER';

  useEffect(() => {
    if (!db) return;
    onSnapshot(query(collection(db, "customers")), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
      setIsLoadingCustomers(false);
    });
    onSnapshot(query(collection(db, "accountingAccounts"), where("isActive", "==", true)), (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingAccount)));
    });
  }, [db]);

  useEffect(() => {
    if (!db || !jobId || isEditing) return;
    setIsLoadingJobs(true);
    onSnapshot(query(collection(db, "jobs"), where("status", "==", "DONE")), (snap) => {
        setJobsReadyToBill(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
        setIsLoadingJobs(false);
    });
  }, [db, jobId, isEditing]);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        jobId: docToEdit.jobId || undefined,
        customerId: docToEdit.customerId || docToEdit.customerSnapshot?.id || "",
        issueDate: docToEdit.docDate,
        items: docToEdit.items.map(item => ({...item})),
        notes: docToEdit.notes ?? '',
        senderName: (profile?.displayName || docToEdit.senderName) || '',
        receiverName: (docToEdit.customerSnapshot?.name || docToEdit.receiverName) || '',
        discountAmount: docToEdit.discountAmount || 0,
        isBackfill: false,
        paymentTerms: docToEdit.paymentTerms || 'CASH',
        suggestedPaymentMethod: docToEdit.suggestedPaymentMethod || 'CASH',
        suggestedAccountId: docToEdit.suggestedAccountId || '',
        billingRequired: docToEdit.billingRequired || false,
        dueDate: docToEdit.dueDate || null,
      });
      if (docToEdit.suggestedPayments) {
          setSuggestedPayments(docToEdit.suggestedPayments);
      } else {
          setSuggestedPayments([{method: 'CASH', accountId: docToEdit.suggestedAccountId || '', amount: docToEdit.grandTotal}]);
      }
      setRecordRemainingAsCredit(docToEdit.paymentTerms === 'CREDIT');
      setSubmitBillingRequired(docToEdit.billingRequired || false);
      setSubmitDueDate(docToEdit.dueDate || '');
      if (docToEdit.referencesDocIds?.[0]) setReferencedQuotationId(docToEdit.referencesDocIds[0]);
    } else if (job) {
        form.setValue('jobId', jobId || undefined);
        form.setValue('customerId', job.customerId);
        form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
        form.setValue('receiverName', job.customerSnapshot?.name || '');
        setSuggestedPayments([{method: 'CASH', accountId: '', amount: 0}]);
    }
    if (profile) form.setValue('senderName', profile.displayName || '');
  }, [job, docToEdit, profile, form, jobId, customers]);

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    form.setValue("subtotal", subtotal);
    form.setValue("net", net);
    form.setValue("grandTotal", net);
  }, [watchedItems, watchedDiscount, form]);

  const currentSuggestedTotal = useMemo(() => suggestedPayments.reduce((sum, p) => sum + (p.amount || 0), 0), [suggestedPayments]);
  const remainingAmount = useMemo(() => (grandTotal || 0) - currentSuggestedTotal, [grandTotal, currentSuggestedTotal]);

  const checkUniqueness = async (jobIdVal: string) => {
    if (!db || isEditing) return true;
    const q = query(
      collection(db, "documents"), 
      where("jobId", "==", jobIdVal), 
      where("docType", "==", "DELIVERY_NOTE"),
      limit(5)
    );
    const snap = await getDocs(q);
    const activeDoc = snap.docs.find(d => d.data().status !== 'CANCELLED');
    if (activeDoc) {
      setExistingActiveDoc({ id: activeDoc.id, ...activeDoc.data() } as DocumentType);
      return false;
    }
    return true;
  };

  const handleFetchFromDoc = async (sourceDoc: DocumentType) => {
    const itemsFromDoc = (sourceDoc.items || []).map((item: any) => ({
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      unitPrice: Number(item.unitPrice ?? 0),
      total: Number(item.total ?? 0),
    }));
    if (itemsFromDoc.length === 0) return;
    replace(itemsFromDoc);
    if (sourceDoc.docType === 'QUOTATION') setReferencedQuotationId(sourceDoc.id);
    form.setValue('discountAmount', Number(sourceDoc.discountAmount ?? 0));
    form.setValue('customerId', sourceDoc.customerId || sourceDoc.customerSnapshot?.id || "");
    form.setValue('receiverName', sourceDoc.customerSnapshot?.name || "");
    if (sourceDoc.status === 'PAID' || sourceDoc.status === 'PENDING_REVIEW') {
        setSelectedLinkDoc(sourceDoc);
        setShowLinkConfirm(true);
    }
    setIsQtSearchOpen(false);
    setIsBillSearchOpen(false);
  };

  const handleConfirmLinkDoc = async () => {
    const activeJobId = jobId || form.getValues('jobId');
    if (!db || !profile || !selectedLinkDoc || !activeJobId) return;
    setIsSubmitting(true);
    try {
        const salesDocInfo = { salesDocType: selectedLinkDoc.docType, salesDocId: selectedLinkDoc.id, salesDocNo: selectedLinkDoc.docNo, paymentStatusAtClose: selectedLinkDoc.status === 'PAID' ? 'PAID' : 'UNPAID' };
        if (selectedLinkDoc.status === 'PAID') {
            await archiveAndCloseJob(db, activeJobId, selectedLinkDoc.docDate, profile, salesDocInfo);
        } else {
            const batch = writeBatch(db);
            batch.update(doc(db, 'jobs', activeJobId), { ...salesDocInfo, status: 'WAITING_CUSTOMER_PICKUP', lastActivityAt: serverTimestamp() });
            batch.update(doc(db, 'documents', selectedLinkDoc.id), { jobId: activeJobId, updatedAt: serverTimestamp() });
            batch.set(doc(collection(db, 'jobs', activeJobId, 'activities')), { text: `เชื่อมโยงบิล (${selectedLinkDoc.docNo}) เข้ากับงาน`, userName: profile.displayName, userId: profile.uid, createdAt: serverTimestamp() });
            await batch.commit();
        }
        router.push('/app/office/jobs/management/history');
    } catch (e: any) { toast({ variant: 'destructive', title: 'Error', description: e.message }); } finally { setIsSubmitting(false); setShowLinkConfirm(false); }
  };

  const executeSave = async (data: DeliveryNoteFormData, submitForReview: boolean) => {
    const customerSnapshot = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) return;
    setIsSubmitting(true);
    const targetStatus = submitForReview ? 'PENDING_REVIEW' : 'DRAFT';
    const jobDetails = job || (isEditing && docToEdit?.jobId ? docToEdit.carSnapshot : null);
    const carSnapshot = (data.jobId || docToEdit?.jobId) ? { 
      licensePlate: (jobDetails as any)?.carServiceDetails?.licensePlate || (jobDetails as any)?.licensePlate || docToEdit?.carSnapshot?.licensePlate,
      brand: (jobDetails as any)?.carServiceDetails?.brand || (jobDetails as any)?.commonrailDetails?.brand || (jobDetails as any)?.mechanicDetails?.brand || (jobDetails as any)?.brand || docToEdit?.carSnapshot?.brand,
      model: (jobDetails as any)?.carServiceDetails?.model || (jobDetails as any)?.model || docToEdit?.carSnapshot?.model,
      partNumber: (jobDetails as any)?.commonrailDetails?.partNumber || (jobDetails as any)?.mechanicDetails?.partNumber || (jobDetails as any)?.partNumber || docToEdit?.carSnapshot?.partNumber,
      registrationNumber: (jobDetails as any)?.commonrailDetails?.registrationNumber || (jobDetails as any)?.mechanicDetails?.registrationNumber || (jobDetails as any)?.registrationNumber || docToEdit?.carSnapshot?.registrationNumber,
      details: (jobDetails as any)?.description || (jobDetails as any)?.details || docToEdit?.carSnapshot?.details 
    } : {};

    try {
        const payload = { 
          ...data, 
          docDate: data.issueDate, 
          customerSnapshot, 
          carSnapshot, 
          storeSnapshot: storeSettings, 
          withTax: false, 
          paymentSummary: { paidTotal: 0, balance: data.grandTotal, paymentStatus: 'UNPAID' }, 
          arStatus: submitForReview ? 'PENDING' : (isEditing ? docToEdit?.arStatus : null), 
          referencesDocIds: referencedQuotationId ? [referencedQuotationId] : [] 
        };
        if (isEditing && editDocId) {
            await updateDoc(doc(db, 'documents', editDocId), sanitizeForFirestore({ ...payload, status: targetStatus, updatedAt: serverTimestamp(), dispute: { isDisputed: false, reason: "" } }));
        } else {
            await createDocument(db, 'DELIVERY_NOTE', payload, profile, data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined, { manualDocNo: data.isBackfill ? data.manualDocNo : undefined, initialStatus: targetStatus });
        }
        toast({ title: submitForReview ? "ส่งตรวจสอบสำเร็จ" : "บันทึกร่างสำเร็จ" });
        router.push('/app/office/documents/delivery-note');
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); } finally { setIsSubmitting(false); }
  };

  const handleSave = async (data: DeliveryNoteFormData, submitForReview: boolean) => {
    if (data.jobId) {
      const ok = await checkUniqueness(data.jobId);
      if (!ok) {
        setPendingFormData(data);
        setIsReviewSubmission(submitForReview);
        setShowDuplicateDialog(true);
        return;
      }
    }

    if (submitForReview) { 
        setPendingFormData(data); 
        setIsReviewSubmission(true); 
        if (suggestedPayments.length === 1 && suggestedPayments[0].amount === 0) {
            setSuggestedPayments([{method: 'CASH', accountId: accounts.find(a=>a.type==='CASH')?.id || '', amount: data.grandTotal}]);
        }
        setShowReviewConfirm(true); 
        return; 
    }
    await executeSave(data, false);
  };

  const handleCancelExistingAndSave = async () => {
    if (!db || !existingActiveDoc || !profile || !pendingFormData) return;
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);
        const docRef = doc(db, 'documents', existingActiveDoc.id);
        
        batch.update(docRef, { 
            status: 'CANCELLED', 
            updatedAt: serverTimestamp(), 
            notes: (existingActiveDoc.notes || "") + `\n[System] ยกเลิกเพื่อออกใบใหม่โดย ${profile.displayName}` 
        });

        if (existingActiveDoc.jobId) {
            const jobRef = doc(db, 'jobs', existingActiveDoc.jobId);
            batch.update(jobRef, { 
                salesDocId: deleteField(), 
                salesDocNo: deleteField(), 
                salesDocType: deleteField(),
                lastActivityAt: serverTimestamp() 
            });
        }
        
        await batch.commit();
        setShowDuplicateDialog(false);
        setExistingActiveDoc(null);
        await handleSave(pendingFormData, isReviewSubmission);
    } catch(e: any) {
        toast({ variant: 'destructive', title: "Error", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!pendingFormData) return;
    const validPayments = suggestedPayments.filter(p => p.amount > 0 && p.accountId);
    const finalPayload: any = {
        ...pendingFormData,
        paymentTerms: recordRemainingAsCredit ? 'CREDIT' : 'CASH',
        suggestedPayments: validPayments,
        suggestedAccountId: validPayments[0]?.accountId || '',
        suggestedPaymentMethod: validPayments[0]?.method || 'CASH',
        billingRequired: recordRemainingAsCredit ? submitBillingRequired : false,
        dueDate: recordRemainingAsCredit ? submitDueDate : null
    };
    await executeSave(finalPayload, true);
    setShowReviewConfirm(false);
  };

  const loadAllDocs = async (type: DocType | 'BILLS') => {
    if (!db) return;
    type === 'QUOTATION' ? setIsSearchingQt(true) : setIsSearchingBills(true);
    try {
        const getTime = (v: any) => v?.toMillis?.() || v?.seconds * 1000 || 0;
        if (type === 'QUOTATION') {
            const snap = await getDocs(query(collection(db, "documents"), where("docType", "==", "QUOTATION"), limit(500)));
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType)).filter(d => d.status !== 'CANCELLED').sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt));
            setAllQuotations(items);
        } else {
            const [s1, s2] = await Promise.all([getDocs(query(collection(db, "documents"), where("docType", "==", "DELIVERY_NOTE"), limit(500))), getDocs(query(collection(db, "documents"), where("docType", "==", "TAX_INVOICE"), limit(500)))]);
            const bills = [...s1.docs, ...s2.docs].map(d => ({ id: d.id, ...d.data() } as DocumentType)).filter(d => d.status !== 'CANCELLED').sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt));
            setAllBills(bills);
        }
    } catch(e) { console.error(e); } finally { type === 'QUOTATION' ? setIsSearchingQt(false) : setIsSearchingBills(false); }
  };

  const getFilteredDocs = (docs: DocumentType[], queryStr: string, typeFilter?: 'DELIVERY_NOTE' | 'TAX_INVOICE') => {
    const q = queryStr.toLowerCase().trim();
    let filtered = typeFilter ? docs.filter(d => d.docType === typeFilter) : docs;
    return q ? filtered.filter(d => d.docNo.toLowerCase().includes(q) || d.customerSnapshot?.name?.toLowerCase().includes(q) || d.customerSnapshot?.phone?.includes(q)) : filtered;
  };

  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomers || isLoadingCustomer || isLoadingDocToEdit;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
  const isCustomerSelectionDisabled = !!currentJobId || (isEditing && !!docToEdit?.customerId) || isLocked;

  if (isLoading && !jobId && !editDocId) return <Skeleton className="h-96" />;

  return (
    <>
      <div className="flex flex-col gap-6">
        {isLocked && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>ล็อก</AlertTitle><AlertDescription>เอกสารถูกส่งตรวจสอบหรือจ่ายแล้ว แก้ไขไม่ได้</AlertDescription></Alert>}
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => form.handleSubmit((d) => handleSave(d, false))()} disabled={isFormLoading || isLocked}>{isSubmitting && !isReviewSubmission ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}บันทึกฉบับร่าง</Button>
                <Button type="button" onClick={() => form.handleSubmit((d) => handleSave(d, true))()} disabled={isFormLoading || isLocked || docToEdit?.status === 'PENDING_REVIEW'}>{isSubmitting && isReviewSubmission ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}ส่งบัญชีตรวจสอบ</Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card><CardHeader><CardTitle>1. ข้อมูลลูกค้า</CardTitle></CardHeader><CardContent className="space-y-4">{!jobId && !isEditing && (<FormField control={form.control} name="jobId" render={({ field }) => (<FormItem><FormLabel>อ้างอิงงานซ่อม</FormLabel><Popover open={isJobPopoverOpen} onOpenChange={setIsJobPopoverOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-between">{field.value ? `งาน: ${field.value.substring(0,8)}` : "เลือกงานที่เสร็จแล้ว..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><div className="p-2 border-b"><Input placeholder="ค้นหา..." value={jobSearch} onChange={e=>setJobSearch(e.target.value)} /></div><ScrollArea className="h-60">{jobsReadyToBill.map(j=>(<Button key={j.id} variant="ghost" onClick={()=>{field.onChange(j.id); form.setValue('customerId',j.customerId); form.setValue('receiverName',j.customerSnapshot.name); setIsJobPopoverOpen(false);}} className="w-full justify-start h-auto p-2 border-b text-left"><div className="flex flex-col"><span className="font-semibold">{j.customerSnapshot.name}</span><span className="text-[10px]">{j.description}</span></div></Button>))}</ScrollArea></PopoverContent></Popover></FormItem>)} />)}<FormField control={form.control} name="customerId" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>ชื่อลูกค้า</FormLabel><Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("w-full justify-between", !field.value && "text-muted-foreground")} disabled={isCustomerSelectionDisabled}>{displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "เลือกลูกค้า..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start"><div className="p-2 border-b"><Input autoFocus placeholder="ค้นหา..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} /></div><ScrollArea className="h-fit max-h-60">{customers.filter(c=>c.name.includes(customerSearch)).map((c) => (<Button key={c.id} variant="ghost" onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3 text-left"><div className="flex flex-col"><span>{c.name}</span><span className="text-[10px] text-muted-foreground">{c.phone}</span></div></Button>))}</ScrollArea></PopoverContent></Popover></FormItem>)} />{displayCustomer && <div className="mt-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-md"><p className="font-medium text-foreground">{displayCustomer.name}</p><p className="whitespace-pre-wrap">{displayCustomer.taxAddress}</p><p>โทร: {displayCustomer.phone}</p></div>}</CardContent></Card>
              <Card className="bg-muted/10 border-dashed flex flex-col items-center justify-center text-center p-6"><AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-2" /><p className="text-sm text-muted-foreground">ระบุเงื่อนไขการแยกจ่ายหรือเครดิต<br/>ในขั้นตอนการส่งตรวจสอบ</p></Card>
            </div>
            <Card><CardHeader className="flex flex-row items-center gap-4 py-3"><CardTitle className="text-base whitespace-nowrap">2. รายการสินค้า/บริการ</CardTitle><div className="flex gap-2"><Popover open={isQtSearchOpen} onOpenChange={setIsQtSearchOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8" onClick={() => loadAllDocs('QUOTATION')} disabled={isLocked}><FileSearch className="mr-2 h-3 w-3" /> ใบเสนอราคา</Button></PopoverTrigger><PopoverContent className="w-80 p-0" align="start"><div className="p-2 border-b"><Input placeholder="ค้นหา..." value={qtSearchQuery} onChange={e=>setQtSearchQuery(e.target.value)} /></div><ScrollArea className="h-60">{isSearchingQt ? <Loader2 className="animate-spin m-4" /> : getFilteredDocs(allQuotations, qtSearchQuery).map(q => (<Button key={q.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 border-b text-left" onClick={() => handleFetchFromDoc(q)}><div className="flex flex-col"><span className="font-semibold">{q.docNo}</span><span className="text-[10px]">{q.customerSnapshot?.name}</span></div></Button>))}</ScrollArea></PopoverContent></Popover><Popover open={isBillSearchOpen} onOpenChange={setIsBillSearchOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8" onClick={() => loadAllDocs('BILLS')} disabled={isLocked}><FileStack className="mr-2 h-3 w-3" /> บิลขาย</Button></PopoverTrigger><PopoverContent className="w-80 p-0" align="start"><Tabs value={billSearchType} onValueChange={(v: any) => setBillSearchType(v)}><TabsList className="w-full rounded-none"><TabsTrigger value="DELIVERY_NOTE" className="flex-1 text-[10px]">ใบส่งของ</TabsTrigger><TabsTrigger value="TAX_INVOICE" className="flex-1 text-[10px]">ใบกำกับ</TabsTrigger></TabsList><div className="p-2 border-b"><Input placeholder="ค้นหา..." value={billSearchQuery} onChange={e => setBillSearchQuery(e.target.value)} /></div><ScrollArea className="h-60">{isSearchingBills ? <Loader2 className="animate-spin m-4" /> : getFilteredDocs(allBills, billSearchQuery, billSearchType).map(d => (<Button key={d.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 border-b text-left" onClick={() => handleFetchFromDoc(d)}><div className="flex flex-col"><span className="font-semibold">{d.docNo}</span><span className="text-[10px]">{d.customerSnapshot?.name}</span></div></Button>))}</ScrollArea></Tabs></PopoverContent></Popover></div></CardHeader>
              <CardContent><Table><TableHeader><TableRow><TableHead className="w-12 text-center">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="text-right">ยอดรวม</TableHead><TableHead/></TableRow></TableHeader><TableBody>{fields.map((field, index) => (<TableRow key={field.id}><TableCell className="text-center">{index + 1}</TableCell><TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} value={field.value ?? ''} disabled={isLocked}/>)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" step="any" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.unitPrice`)); }} disabled={isLocked} />)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" step="any" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.quantity`)); }} disabled={isLocked} />)}/></TableCell><TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell><TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isLocked}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell></TableRow>))}</TableBody></Table><Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})} disabled={isLocked}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button></CardContent></Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                <CardContent className="space-y-4"><FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormControl><Textarea placeholder="รายละเอียด..." rows={4} {...field} disabled={isLocked}/></FormControl></FormItem>)} /><div className="grid grid-cols-1 gap-4"><FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} /></div><div className="grid grid-cols-2 gap-4"><FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งของ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} /><FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับของ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} /></div></CardContent></Card>
              <div className="space-y-4 p-6 border rounded-lg bg-muted/30"><div className="flex justify-between items-center text-sm"><span>รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div><div className="flex justify-between items-center text-sm"><span>ส่วนลด</span><FormField control={form.control} name="discountAmount" render={({ field }) => ( <Input type="number" step="any" className="w-32 text-right bg-background h-8" {...field} value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} disabled={isLocked} /> )}/></div><Separator/><div className="flex justify-between items-center text-lg font-bold text-primary"><span>ยอดรวมสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div></div>
            </div>
          </form>
        </Form>
      </div>

      {/* Uniqueness/Duplicate Check Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              พบเอกสารเดิมในระบบ
            </DialogTitle>
            <DialogDescription>
              งานซ่อมนี้มีการออก <b>ใบส่งของชั่วคราว</b> ไปแล้วคือเลขที่ <span className="font-bold text-primary">{existingActiveDoc?.docNo}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Alert variant="secondary" className="bg-amber-50 border-amber-200">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">นโยบายระบบ</AlertTitle>
              <AlertDescription className="text-amber-700 text-xs">
                หนึ่งงานซ่อมสามารถผูกใบส่งของได้เพียงฉบับเดียวเท่านั้น เพื่อป้องกันการสับสนทางบัญชีค่ะ
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push(`/app/office/documents/delivery-note/${existingActiveDoc?.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> ดูใบเดิม
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleCancelExistingAndSave} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              ยกเลิกใบเดิมและบันทึกใหม่
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReviewConfirm} onOpenChange={setShowReviewConfirm}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>ระบุเงื่อนไขการรับเงิน (สำหรับการตรวจสอบ)</DialogTitle>
            <DialogDescription>แยกประเภทเงินเข้าบัญชี หรือระบุยอดติดเครดิตให้ชัดเจน</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 flex justify-between items-center">
                <span className="font-semibold text-primary">ยอดรวมบิลทั้งสิ้น:</span>
                <span className="text-2xl font-black text-primary">฿{formatCurrency(grandTotal)}</span>
            </div>

            <div className="space-y-4">
                <Label className="flex items-center gap-2"><Wallet className="h-4 w-4" /> บันทึกการรับเงิน (Cash/Transfer)</Label>
                <div className="border rounded-md overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-32">ช่องทาง</TableHead>
                                <TableHead>เข้าบัญชี</TableHead>
                                <TableHead className="w-32">จำนวนเงิน</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suggestedPayments.map((p, i) => (
                                <TableRow key={i}>
                                    <TableCell className="p-2">
                                        <Select value={p.method} onValueChange={(v: any) => {
                                            const newPayments = [...suggestedPayments];
                                            newPayments[i].method = v;
                                            setSuggestedPayments(newPayments);
                                        }}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="CASH">เงินสด</SelectItem>
                                                <SelectItem value="TRANSFER">เงินโอน</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-2">
                                        <Select value={p.accountId} onValueChange={(v) => {
                                            const newPayments = [...suggestedPayments];
                                            newPayments[i].accountId = v;
                                            setSuggestedPayments(newPayments);
                                        }}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="เลือก..."/></SelectTrigger>
                                            <SelectContent>
                                                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="p-2">
                                        <Input 
                                            type="number" 
                                            className="h-8 text-right text-xs" 
                                            value={p.amount || ''} 
                                            onChange={(e) => {
                                                const newPayments = [...suggestedPayments];
                                                newPayments[i].amount = parseFloat(e.target.value) || 0;
                                                setSuggestedPayments(newPayments);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell className="p-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setSuggestedPayments(prev => prev.filter((_, idx) => idx !== i))}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <Button variant="outline" size="sm" className="w-full h-8 border-dashed" onClick={() => setSuggestedPayments([...suggestedPayments, {method: 'CASH', accountId: '', amount: 0}])}>
                    <PlusCircle className="mr-2 h-3 w-3" /> เพิ่มช่องทางชำระเงิน
                </Button>
            </div>

            <div className="space-y-4 pt-4 border-t">
                <div className={cn("flex justify-between items-center p-3 rounded-md border", remainingAmount > 0.01 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200")}>
                    <span className="text-sm font-bold">ยอดเงินส่วนต่าง (คงเหลือ):</span>
                    <span className={cn("text-lg font-black", remainingAmount > 0.01 ? "text-amber-600" : "text-green-600")}>฿{formatCurrency(remainingAmount)}</span>
                </div>

                {remainingAmount > 0.01 && (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="r-credit" checked={recordRemainingAsCredit} onCheckedChange={(v: any) => setRecordRemainingAsCredit(v)} />
                            <Label htmlFor="r-credit" className="font-bold text-amber-700">บันทึกยอดคงเหลือเป็นลูกหนี้ (Credit / AR)</Label>
                        </div>
                        
                        {recordRemainingAsCredit && (
                            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                                <div className="space-y-2">
                                    <Label className="text-xs">วันครบกำหนด</Label>
                                    <Input type="date" value={submitDueDate} onChange={e => setSubmitDueDate(e.target.value)} />
                                </div>
                                <div className="flex items-center space-x-2 pt-6">
                                    <Checkbox id="r-billing" checked={submitBillingRequired} onCheckedChange={(v: any) => setSubmitBillingRequired(v)} />
                                    <Label htmlFor="r-billing" className="text-xs">ต้องวางบิลรวม</Label>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>

          <DialogFooter className="bg-muted/30 p-6 border-t">
            <Button variant="outline" onClick={() => setShowReviewConfirm(false)}>ยกเลิก</Button>
            <Button 
                onClick={handleFinalSubmit} 
                disabled={isSubmitting || (remainingAmount > 0.01 && !recordRemainingAsCredit) || (suggestedPayments.some(p => p.amount > 0 && !p.accountId))}
            >
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2" />}
                ยืนยันและส่งให้บัญชี
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showLinkConfirm} onOpenChange={setShowLinkConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>เชื่อมโยงเอกสารเดิม</AlertDialogTitle><AlertDialogDescription>ต้องการเชื่อมบิล {selectedLinkDoc?.docNo} เข้ากับงานนี้?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedLinkDoc(null)}>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={handleConfirmLinkDoc} disabled={isSubmitting}>ใช่, เชื่อมโยง</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}
