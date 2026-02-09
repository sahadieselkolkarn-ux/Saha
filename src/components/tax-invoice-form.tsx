"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs, orderBy, limit, writeBatch } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, FileSearch, FileStack, AlertCircle, Send, X, Search } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { archiveAndCloseJob } from "@/firebase/jobs-archive";
import type { Job, StoreSettings, Customer, Document as DocumentType, AccountingAccount, DocType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { deptLabel } from "@/lib/ui-labels";

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
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [referencedQuotationId, setReferencedQuotationId] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingDn, setExistingDn] = useState<DocumentType | null>(null);
  const [setShowDnCancelDialog, setSetShowDnCancelDialog] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<TaxInvoiceFormData | null>(null);
  const [isReviewSubmission, setIsReviewSubmission] = useState(false);

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
  
  const isLocked = isEditing && docToEdit?.status === 'PAID' && profile?.role !== 'ADMIN' && profile?.role !== 'MANAGER';

  useEffect(() => {
    if (!db) return;
    const qCustomers = query(collection(db, "customers"));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลลูกค้าได้" });
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
      form.setValue('jobId', jobId || undefined);
      form.setValue('customerId', job.customerId);
      form.setValue('receiverName', job.customerSnapshot.name ?? '');
    }
     if (profile) {
      form.setValue('senderName', profile.displayName ?? '');
    }
  }, [job, docToEdit, profile, form, jobId, customers]);

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
    form.setValue('isVat', true, { shouldDirty: true, shouldValidate: true });
    form.setValue('customerId', sourceDoc.customerId || sourceDoc.customerSnapshot?.id || "");
    form.setValue('receiverName', sourceDoc.customerSnapshot?.name || "");
    form.trigger(['items', 'discountAmount', 'isVat', 'customerId']);

    if (sourceDoc.status === 'PAID' || sourceDoc.status === 'PENDING_REVIEW') {
        setSelectedLinkDoc(sourceDoc);
        setShowLinkConfirm(true);
        return;
    }
  
    toast({ title: "ดึงข้อมูลสำเร็จ", description: `ดึงจาก ${sourceDoc.docType} เลขที่ ${sourceDoc.docNo}` });
    setIsQtSearchOpen(false);
    setIsBillSearchOpen(false);
  };

  const handleConfirmLinkDoc = async () => {
    const activeJobId = jobId || form.getValues('jobId');
    if (!db || !profile || !selectedLinkDoc || !activeJobId) {
        toast({ variant: 'destructive', title: 'ไม่สามารถเชื่อมโยงได้', description: 'ต้องระบุงานซ่อมที่ต้องการเชื่อมโยงก่อน' });
        return;
    }

    setIsSubmitting(true);
    try {
        const salesDocInfo = {
            salesDocType: selectedLinkDoc.docType,
            salesDocId: selectedLinkDoc.id,
            salesDocNo: selectedLinkDoc.docNo,
            paymentStatusAtClose: selectedLinkDoc.status === 'PAID' ? 'PAID' : 'UNPAID'
        } as any;

        if (selectedLinkDoc.status === 'PAID') {
            await archiveAndCloseJob(db, activeJobId, selectedLinkDoc.docDate, profile, salesDocInfo);
            toast({ title: 'เชื่อมโยงบิลและปิดงานสำเร็จ' });
        } else {
            const batch = writeBatch(db);
            const jobRef = doc(db, 'jobs', activeJobId);
            const docRef = doc(db, 'documents', selectedLinkDoc.id);
            const activityRef = doc(collection(db, 'jobs', activeJobId, 'activities'));
            
            batch.update(jobRef, {
                ...salesDocInfo,
                status: 'WAITING_CUSTOMER_PICKUP',
                lastActivityAt: serverTimestamp(),
            });
            batch.update(docRef, {
                jobId: activeJobId,
                updatedAt: serverTimestamp()
            });
            batch.set(activityRef, {
                text: `เชื่อมโยงบิลที่รอตรวจสอบ (${selectedLinkDoc.docNo}) เข้ากับงานนี้`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
            });
            await batch.commit();
            toast({ title: 'เชื่อมโยงบิลเรียบร้อย' });
        }
        
        router.push('/app/office/jobs/management/history');
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    } finally {
        setIsSubmitting(false);
        setShowLinkConfirm(false);
        setSelectedLinkDoc(null);
    }
  };

  const loadAllDocs = async (type: DocType | 'BILLS') => {
    if (!db) return;
    if (type === 'QUOTATION') setIsSearchingQt(true); else setIsSearchingBills(true);
    
    try {
        const getTime = (val: any) => {
            if (!val) return 0;
            if (typeof val.toMillis === 'function') return val.toMillis();
            if (val instanceof Date) return val.getTime();
            if (val.seconds) return val.seconds * 1000;
            return 0;
        };

        if (type === 'QUOTATION') {
            const q = query(
                collection(db, "documents"),
                where("docType", "==", "QUOTATION"),
                limit(1000)
            );
            const snap = await getDocs(q);
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType)).filter(d => d.status !== 'CANCELLED');
            items.sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt));
            setAllQuotations(items);
        } else {
            const qDn = query(collection(db, "documents"), where("docType", "==", "DELIVERY_NOTE"), limit(1000));
            const qTi = query(collection(db, "documents"), where("docType", "==", "TAX_INVOICE"), limit(1000));
            const [snapDn, snapTi] = await Promise.all([getDocs(qDn), getDocs(qTi)]);
            const bills = [
                ...snapDn.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType)),
                ...snapTi.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType))
            ].filter(d => d.status !== 'CANCELLED');
            bills.sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt));
            setAllBills(bills);
        }
    } catch (e: any) {
        console.error(e);
        toast({ variant: 'destructive', title: "ค้นหาล้มเหลว", description: e.message });
    } finally {
        if (type === 'QUOTATION') setIsSearchingQt(false); else setIsSearchingBills(false);
    }
  };

  const executeSave = async (data: TaxInvoiceFormData, submitForReview: boolean) => {
    const customerSnapshot = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "ข้อมูลลูกค้าหรือร้านค้าไม่สมบูรณ์" });
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
                dispute: { isDisputed: false, reason: "" } 
            }));
        } else {
            const result = await createDocument(
                db,
                'TAX_INVOICE',
                documentDataPayload,
                profile,
                data.jobId ? 'WAITING_APPROVE' : undefined,
                options
            );
            docId = result.docId;
        }
        
        toast({ title: submitForReview ? "ส่งรายการตรวจสอบสำเร็จ" : "บันทึกฉบับร่างสำเร็จ" });
        router.push('/app/office/documents/tax-invoice');

    } catch (error: any) {
        toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: "ไม่สามารถบันทึกข้อมูลได้" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSave = async (data: TaxInvoiceFormData, submitForReview: boolean) => {
    if (submitForReview) {
        setPendingData(data);
        setIsReviewSubmission(true);
        
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
                setSetShowDnCancelDialog(true);
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
        setSetShowDnCancelDialog(false);
        setShowReviewConfirm(true);
    } catch(e: any) {
        toast({ variant: 'destructive', title: "ยกเลิกไม่สำเร็จ", description: "เกิดข้อผิดพลาด" });
    }
  };

  const isLoading = isLoadingStore || isLoadingJob || isLoadingDocToEdit || isLoadingCustomers || isLoadingCustomer;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;
  const isCustomerSelectionDisabled = isLocked || !!jobId || (isEditing && !!docToEdit?.customerId);

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
        (d.customerSnapshot?.phone || "").toLowerCase().includes(q)
    );
  };

  if (isLoading && !jobId && !editDocId) {
    return <Skeleton className="h-96" />;
  }
  
  return (
    <>
      {isLocked && (
          <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>เอกสารถูกล็อก</AlertTitle>
              <AlertDescription>เอกสารนี้ถูกยืนยันรายรับแล้ว จึงไม่สามารถแก้ไขได้</AlertDescription>
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
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked} />
                              </FormControl>
                              <div className="space-y-1 leading-none"><FormLabel>บันทึกย้อนหลัง (Backfill)</FormLabel></div>
                              </FormItem>
                          )}
                      />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่เอกสาร</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      {form.watch('isBackfill') && (
                          <FormField control={form.control} name="manualDocNo" render={({ field }) => (<FormItem><FormLabel>เลขที่เอกสารเดิม</FormLabel><FormControl><Input placeholder="INV2024-0001" {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      )}
                  </div>
              </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
                <CardContent>
                    <FormField
                        name="customerId"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>ชื่อลูกค้า</FormLabel>
                            <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button variant="outline" role="combobox" className={cn("w-full justify-between", !field.value && "text-muted-foreground")} disabled={isCustomerSelectionDisabled}>
                                    {displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "เลือกลูกค้า..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <div className="p-2 border-b"><Input autoFocus placeholder="พิมพ์ชื่อหรือเบอร์โทร..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} /></div>
                                    <ScrollArea className="h-fit max-h-60">
                                        {filteredCustomers.map((c) => (
                                            <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3 text-left">
                                                <div className="flex flex-col"><span>{c.name}</span><span className="text-[10px] text-muted-foreground">{c.phone}</span></div>
                                            </Button>
                                            ))}
                                    </ScrollArea>
                                </PopoverContent>
                            </Popover>
                            </FormItem>
                        )}
                    />
                    {displayCustomer && (
                        <div className="mt-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                            <p className="font-medium text-foreground">{displayCustomer.taxName || displayCustomer.name}</p>
                            <p className="whitespace-pre-wrap">{displayCustomer.taxAddress || 'ไม่มีข้อมูลที่อยู่'}</p>
                            <p>โทร: {displayCustomer.phone}</p>
                            <p>เลขประจำตัวผู้เสียภาษี: {displayCustomer.taxId || 'N/A'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">การชำระเงิน</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                        <FormItem>
                            <FormLabel>เงื่อนไขการชำระเงิน</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6 pt-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="CASH" id="cash" disabled={isLocked} /><Label htmlFor="cash">เงินสด/โอน</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="CREDIT" id="credit" disabled={isLocked} /><Label htmlFor="credit">เครดิต</Label></div>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    {form.watch('paymentTerms') === 'CASH' && (
                        <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-muted/30">
                            <FormField control={form.control} name="suggestedPaymentMethod" render={({ field }) => (
                                <FormItem><FormLabel>รูปแบบรับ</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="bg-background"><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">เงินโอน</SelectItem></SelectContent></Select></FormItem>
                            )} />
                            <FormField control={form.control} name="suggestedAccountId" render={({ field }) => (
                                <FormItem><FormLabel>บัญชีที่รับเงิน</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>
                            )} />
                        </div>
                    )}
                    <FormField control={form.control} name="billingRequired" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked} /></FormControl>
                            <div className="space-y-1 leading-none"><FormLabel>ต้องออกใบวางบิลรวม</FormLabel></div>
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
                              <div className="p-2 border-b"><Input placeholder="ค้นหาเลขที่, ชื่อ, เบอร์โทร..." value={qtSearchQuery} onChange={e=>setQtSearchQuery(e.target.value)} /></div>
                              <ScrollArea className="h-60">
                                  {isSearchingQt ? <div className="p-4 text-center"><Loader2 className="animate-spin inline mr-2"/>กำลังโหลด...</div> : 
                                   getFilteredDocs(allQuotations, qtSearchQuery).map(q => (
                                      <Button key={q.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none text-left" onClick={() => handleFetchFromDoc(q)}>
                                          <div className="flex flex-col"><span className="font-semibold">{q.docNo}</span><span className="text-[10px] text-muted-foreground">{q.customerSnapshot?.name} • {q.customerSnapshot?.phone}</span><span className="text-[10px] text-muted-foreground">{safeFormat(new Date(q.docDate), 'dd/MM/yy')} • ฿{formatCurrency(q.grandTotal)}</span></div>
                                      </Button>
                                  ))}
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
                                  <div className="p-2 border-b"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="ค้นหาเลขที่, ชื่อ, เบอร์โทร..." value={billSearchQuery} onChange={e => setBillSearchQuery(e.target.value)} className="pl-8" autoFocus /></div></div>
                                  <ScrollArea className="h-60">
                                      {isSearchingBills ? (<div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline mr-2"/>กำลังโหลด...</div>) : 
                                       getFilteredDocs(allBills, billSearchQuery, billSearchType).map(d => (
                                          <Button key={d.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none text-left" onClick={() => handleFetchFromDoc(d)}>
                                              <div className="flex flex-col"><span className="font-semibold">{d.docNo}</span><span className="text-[10px] text-muted-foreground">{d.customerSnapshot?.name} • {d.customerSnapshot?.phone}</span><span className="text-[10px] text-muted-foreground">{safeFormat(new Date(d.docDate), 'dd/MM/yy')} • ฿{formatCurrency(d.grandTotal)}</span><div className="mt-1"><Badge variant="outline" className="text-[8px] uppercase">{d.status}</Badge></div></div>
                                          </Button>
                                      ))}
                                  </ScrollArea>
                              </Tabs>
                          </PopoverContent>
                      </Popover>
                  </div>
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader><TableRow><TableHead className="w-12 text-center">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="text-right">ยอดรวม</TableHead><TableHead/></TableRow></TableHeader>
                      <TableBody>
                          {fields.map((field, index) => (
                              <TableRow key={field.id}><TableCell className="text-center">{index + 1}</TableCell><TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} placeholder="ชื่อรายการสินค้าหรือบริการ" disabled={isLocked}/>)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.unitPrice`), { shouldValidate: true }); }} disabled={isLocked} />)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" className="text-right" value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.quantity`), { shouldValidate: true }); }} disabled={isLocked} />)}/></TableCell><TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell><TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isLocked}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell></TableRow>
                          ))}
                      </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})} disabled={isLocked}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
              </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                  <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                       <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormControl><Textarea placeholder="ระบุรายละเอียดเพิ่มเติม..." rows={4} disabled={isLocked}/></FormControl></FormItem>)} />
                       <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้มีอำนาจลงนาม (ร้าน)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                          <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับบริการ (ลูกค้า)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isLocked} /></FormControl></FormItem>)} />
                      </div>
                  </CardContent>
              </Card>
              <div className="space-y-4 p-6 border rounded-lg bg-muted/30">
                  <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div>
                  <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">ส่วนลด</span>
                      <FormField control={form.control} name="discountAmount" render={({ field }) => ( <Input type="number" className="w-32 text-right bg-background" value={(field.value ?? 0) === 0 ? "" : field.value} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} disabled={isLocked} /> )}/>
                  </div>
                  <div className="flex justify-between items-center font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                  <div className="flex justify-between items-center text-sm">
                      <FormField control={form.control} name="isVat" render={({ field }) => (
                          <div className="flex items-center gap-2"><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLocked}/><Label className="font-normal cursor-pointer">ภาษีมูลค่าเพิ่ม 7%</Label></div>
                      )}/>
                      <span>{formatCurrency(form.watch('vatAmount'))}</span>
                  </div>
                  <Separator/>
                  <div className="flex justify-between items-center text-lg font-bold text-primary"><span >ยอดรวมสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div>
              </div>
          </div>
        </form>
      </Form>

      <AlertDialog open={setShowDnCancelDialog} onOpenChange={setSetShowDnCancelDialog}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>พบใบส่งของชั่วคราวเดิม</AlertDialogTitle>
                  <AlertDialogDescription>งานซ่อมนี้มีใบส่งของชั่วคราวเลขที่ <span className="font-bold">{existingDn?.docNo}</span> อยู่แล้ว ต้องการยกเลิกใบเดิมเพื่อใช้ใบกำกับภาษีนี้แทนหรือไม่?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <Button variant="secondary" onClick={() => { setSetShowDnCancelDialog(false); setShowReviewConfirm(true); }}>ไม่ยกเลิก (ออกคู่กัน)</Button>
                  <AlertDialogAction onClick={handleConfirmCancelAndSave} className="bg-destructive hover:bg-destructive/90">ยกเลิกใบเดิมและไปต่อ</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReviewConfirm} onOpenChange={setShowReviewConfirm}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>ยืนยันการส่งให้ฝ่ายบัญชีตรวจสอบ?</AlertDialogTitle></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={() => { if(pendingData) executeSave(pendingData, true); }}>ตกลง ส่งตรวจสอบ</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLinkConfirm} onOpenChange={setShowLinkConfirm}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการเชื่อมโยงเอกสารเดิม</AlertDialogTitle>
                  <AlertDialogDescription>
                      {selectedLinkDoc?.status === 'PAID' ? (
                          <>รายการนี้ <span className="font-bold text-green-600">ได้รับเงินเรียบร้อยแล้ว</span> คุณต้องการบันทึกลงใน Job นี้และปิดงานทันทีใช่หรือไม่?</>
                      ) : (
                          <>บิลตัวนี้ <span className="font-bold text-amber-600">ถูกส่งไปตรวจสอบที่แผนกบัญชีแล้ว</span> คุณต้องการบันทึกบิลนี้ใส่ใน Job นี้ ใช่หรือไม่?</>
                      )}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setSelectedLinkDoc(null); }}>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmLinkDoc} disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} ใช่, เชื่อมโยงและดำเนินการต่อ
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}