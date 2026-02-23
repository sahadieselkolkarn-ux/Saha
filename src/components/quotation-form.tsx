"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, serverTimestamp, updateDoc, where, orderBy, setDoc, getDocs, limit, writeBatch, deleteField } from "firebase/firestore";
import { useFirebase, useCollection, useDoc } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, AlertCircle, LayoutTemplate, Eye, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { createDocument } from "@/firebase/documents";
import type { Job, StoreSettings, Customer, Document as DocumentType, QuotationTemplate } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

const lineItemSchema = z.object({
  description: z.string().min(1, "ต้องกรอกรายละเอียดรายการ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number().default(0),
});

const quotationFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "กรุณาเลือกลูกค้าจากรายการ"),
  issueDate: z.string().min(1, "กรุณาเลือกวันที่ออกเอกสาร"),
  expiryDate: z.string().min(1, "กรุณาเลือกวันที่ยืนราคา"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการในตาราง"),
  subtotal: z.coerce.number().default(0),
  discountAmount: z.coerce.number().min(0, "ส่วนลดห้ามติดลบ").optional().default(0),
  net: z.coerce.number().default(0),
  isVat: z.boolean().default(true),
  vatAmount: z.coerce.number().default(0),
  grandTotal: z.coerce.number().min(0.01, "ยอดรวมสุทธิไม่ถูกต้อง").default(0),
  notes: z.string().optional().default(""),
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
  
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Uniqueness check states
  const [existingActiveDoc, setExistingActiveDoc] = useState<DocumentType | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<QuotationFormData | null>(null);

  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "documents", editDocId) : null), [db, editDocId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const templatesQuery = useMemo(() => (db ? query(collection(db, "quotationTemplates"), orderBy("updatedAt", "desc")) : null), [db]);

  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  const { data: templates, isLoading: isLoadingTemplates } = useCollection<QuotationTemplate>(templatesQuery);
  
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
  const isCancelled = docToEdit?.status === 'CANCELLED';

  useEffect(() => {
    if (!db) return;
    setIsLoadingCustomers(true);
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      console.error("Error loading customers:", error);
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    const dataToLoad = docToEdit || job;
    if (!dataToLoad) return;

    let customerId = (dataToLoad as any).customerId || (dataToLoad as any).customerSnapshot?.id || "";
    
    if (!customerId && dataToLoad.customerSnapshot?.name && dataToLoad.customerSnapshot?.phone && customers.length > 0) {
      const found = customers.find(c => c.name === dataToLoad.customerSnapshot?.name && c.phone === dataToLoad.customerSnapshot?.phone);
      if (found) customerId = found.id;
    }

    const items = 'items' in dataToLoad && dataToLoad.items && dataToLoad.items.length > 0
        ? dataToLoad.items.map(item => ({ 
            description: item.description || "", 
            quantity: Number(item.quantity) || 0, 
            unitPrice: Number(item.unitPrice) || 0, 
            total: Number(item.total) || 0 
          }))
        : [{ description: (dataToLoad as any).description || (dataToLoad as any).technicalReport || '', quantity: 1, unitPrice: 0, total: 0 }];

    form.reset({
        jobId: 'jobId' in dataToLoad ? dataToLoad.jobId || undefined : jobId || undefined,
        customerId: customerId,
        issueDate: 'docDate' in dataToLoad ? dataToLoad.docDate : new Date().toISOString().split("T")[0],
        expiryDate: 'expiryDate' in dataToLoad && (dataToLoad as any).expiryDate ? (dataToLoad as any).expiryDate : new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split("T")[0],
        items: items,
        notes: 'notes' in dataToLoad ? dataToLoad.notes : '',
        isVat: 'withTax' in dataToLoad ? dataToLoad.withTax : true,
        discountAmount: 'discountAmount' in dataToLoad ? Number(dataToLoad.discountAmount) || 0 : 0,
        subtotal: 'subtotal' in dataToLoad ? Number(dataToLoad.subtotal) || 0 : 0,
        net: 'net' in dataToLoad ? Number(dataToLoad.net) || 0 : 0,
        vatAmount: 'vatAmount' in dataToLoad ? Number(dataToLoad.vatAmount) || 0 : 0,
        grandTotal: 'grandTotal' in dataToLoad ? Number(dataToLoad.grandTotal) || 0 : 0,
    });
  }, [job, docToEdit, customers, jobId, form]);

  const applyTemplate = (template: QuotationTemplate) => {
    form.setValue("items", template.items.map(i => ({ ...i })), { shouldValidate: true });
    form.setValue("notes", template.notes || "", { shouldValidate: true });
    form.setValue("discountAmount", template.discountAmount || 0, { shouldValidate: true });
    form.setValue("isVat", template.withTax ?? true, { shouldValidate: true });
    setIsTemplatePopoverOpen(false);
    toast({ title: "ดึงข้อมูลจาก Template สำเร็จ" });
  };

  const handleSaveAsTemplate = async () => {
    if (!db || !profile || !newTemplateName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const data = form.getValues();
      const templateRef = doc(collection(db, "quotationTemplates"));
      await setDoc(templateRef, sanitizeForFirestore({
        id: templateRef.id,
        name: newTemplateName.trim(),
        items: data.items,
        notes: data.notes,
        discountAmount: data.discountAmount || 0,
        withTax: data.isVat,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: profile.uid,
        createdByName: profile.displayName,
      }));
      toast({ title: "บันทึกเป็น Template สำเร็จ" });
      setIsSaveTemplateDialogOpen(false);
      setNewTemplateName("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "บันทึกไม่สำเร็จ", description: e.message });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const checkUniqueness = async (jobIdVal: string) => {
    if (!db || isEditing) return true;
    const q = query(
      collection(db, "documents"), 
      where("jobId", "==", jobIdVal), 
      where("docType", "==", "QUOTATION"),
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

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });
  const watchedIsVat = useWatch({ control: form.control, name: "isVat" });

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const discount = Number(watchedDiscount) || 0;
    const net = Math.max(0, subtotal - discount);
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal, { shouldValidate: true });
    form.setValue("net", net, { shouldValidate: true });
    form.setValue("vatAmount", vatAmount, { shouldValidate: true });
    form.setValue("grandTotal", grandTotal, { shouldValidate: true });
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const executeSave = async (data: QuotationFormData) => {
    const customerSnapshot = customers.find(c => c.id === data.customerId) || docToEdit?.customerSnapshot || job?.customerSnapshot;
    if (!db || !customerSnapshot || !profile || !storeSettings) return;
    setIsSubmitting(true);

    const carSnapshot = (job || docToEdit?.jobId) ? { 
      licensePlate: job?.carServiceDetails?.licensePlate || docToEdit?.carSnapshot?.licensePlate,
      brand: job?.carServiceDetails?.brand || job?.commonrailDetails?.brand || job?.mechanicDetails?.brand || docToEdit?.carSnapshot?.brand,
      model: job?.carServiceDetails?.model || docToEdit?.carSnapshot?.model,
      partNumber: job?.commonrailDetails?.partNumber || job?.mechanicDetails?.partNumber || docToEdit?.carSnapshot?.partNumber,
      registrationNumber: job?.commonrailDetails?.registrationNumber || job?.mechanicDetails?.registrationNumber || docToEdit?.carSnapshot?.registrationNumber,
      details: job?.description || docToEdit?.carSnapshot?.details 
    } : {};

    const documentData = {
        customerId: data.customerId,
        docDate: data.issueDate,
        jobId: data.jobId,
        customerSnapshot: { ...customerSnapshot, id: data.customerId },
        carSnapshot: carSnapshot,
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
            await updateDoc(doc(db, 'documents', editDocId), sanitizeForFirestore({ ...documentData, updatedAt: serverTimestamp() }));
            toast({ title: "อัปเดตสำเร็จ" });
            router.push(`/app/office/documents/quotation/${editDocId}`);
        } else {
            const { docId } = await createDocument(db, 'QUOTATION', documentData, profile, data.jobId ? 'WAITING_APPROVE' : undefined);
            toast({ title: "สร้างใบเสนอราคาสำเร็จ" });
            router.push(`/app/office/documents/quotation/${docId}`);
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
    } finally { setIsSubmitting(false); }
  };

  const onSubmit = async (data: QuotationFormData) => {
    if (isCancelled) return;
    if (data.jobId) {
      const ok = await checkUniqueness(data.jobId);
      if (!ok) {
        setPendingFormData(data);
        setShowDuplicateDialog(true);
        return;
      }
    }
    await executeSave(data);
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
            notes: (existingActiveDoc.notes || "") + `\n[System] ยกเลิกโดย ${profile.displayName} เพื่อออกใบใหม่` 
        });
        if (existingActiveDoc.jobId) {
            const jobRef = doc(db, 'jobs', existingActiveDoc.jobId);
            batch.update(jobRef, { salesDocId: deleteField(), salesDocNo: deleteField(), salesDocType: deleteField() });
        }
        await batch.commit();
        setShowDuplicateDialog(false);
        setExistingActiveDoc(null);
        await executeSave(pendingFormData);
    } catch(e: any) { toast({ variant: 'destructive', title: "Error", description: e.message }); } finally { setIsSubmitting(false); }
  };

  const isLoading = isLoadingStore || isLoadingJob || isLoadingDocToEdit || isLoadingCustomers;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch));
  }, [customers, customerSearch]);

  if (isLoading && !jobId && !editDocId) return <div className="p-8 space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {isCancelled && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>ยกเลิกแล้ว</AlertTitle><AlertDescription>ไม่สามารถแก้ไขข้อมูลได้</AlertDescription></Alert>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border rounded-lg bg-card shadow-sm">
            <div className="lg:col-span-2 space-y-2"><h2 className="text-xl font-bold">{storeSettings?.taxName || 'Sahadiesel Service'}</h2><p className="text-sm text-muted-foreground whitespace-pre-wrap">{storeSettings?.taxAddress}</p><p className="text-sm text-muted-foreground">โทร: {storeSettings?.phone}</p></div>
            <div className="space-y-4"><h1 className="text-2xl font-bold text-right text-primary">ใบเสนอราคา</h1>{isEditing && <p className="text-right text-sm font-mono">{docToEdit?.docNo}</p>}<FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่ออกเอกสาร</FormLabel><FormControl><Input type="date" {...field} disabled={isCancelled} /></FormControl></FormItem>)} /><FormField control={form.control} name="expiryDate" render={({ field }) => (<FormItem><FormLabel>ยืนราคาถึงวันที่</FormLabel><FormControl><Input type="date" {...field} disabled={isCancelled} /></FormControl></FormItem>)} /></div>
        </div>
        <Card><CardHeader><CardTitle className="text-base">ข้อมูลลูกค้า</CardTitle></CardHeader><CardContent><FormField name="customerId" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>ชื่อลูกค้า</FormLabel><Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("w-full max-w-sm justify-between font-normal", !field.value && "text-muted-foreground")} disabled={isCustomerSelectionDisabled}><span className="truncate">{currentCustomer ? `${currentCustomer.name} (${currentCustomer.phone})` : "เลือกลูกค้า..."}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start"><div className="p-2 border-b"><Input autoFocus placeholder="ค้นหา..." value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} /></div><ScrollArea className="h-fit max-h-60">{filteredCustomers.map(c=>(<Button key={c.id} variant="ghost" onClick={()=>{field.onChange(c.id); setIsCustomerPopoverOpen(false);}} className="w-full justify-start h-auto py-2 px-3 border-b text-left"><div className="flex flex-col"><span>{c.name}</span><span className="text-xs text-muted-foreground">{c.phone}</span></div></Button>))}</ScrollArea></PopoverContent></Popover></FormItem>)} /></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between py-3"><CardTitle className="text-base whitespace-nowrap">รายการสินค้า/บริการ</CardTitle><div className="flex gap-2"><Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" disabled={isCancelled}><LayoutTemplate className="mr-2 h-4 w-4"/>เลือกจาก Template</Button></PopoverTrigger><PopoverContent className="w-80 p-0" align="end"><ScrollArea className="h-64">{templates?.map(t=>(<Button key={t.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 border-b text-left flex flex-col items-start" onClick={()=>applyTemplate(t)}><span className="font-medium text-sm">{t.name}</span><span className="text-[10px] text-muted-foreground">{t.items.length} รายการ</span></Button>))}</ScrollArea></PopoverContent></Popover></div></CardHeader>
          <CardContent><div className="border rounded-md overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-12 text-center">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="w-40 text-right">ยอดรวม</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader><TableBody>{fields.map((field, index) => (<TableRow key={field.id}><TableCell className="text-center">{index + 1}</TableCell><TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} disabled={isCancelled} />)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" step="any" className="text-right" value={field.value || ''} onChange={(e) => { const v = parseFloat(e.target.value) || 0; field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.unitPrice`)); }} disabled={isCancelled} />)}/></TableCell><TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" step="any" className="text-right" value={field.value || ''} onChange={(e) => { const v = parseFloat(e.target.value) || 0; field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.quantity`)); }} disabled={isCancelled} />)}/></TableCell><TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell><TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isCancelled}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell></TableRow>))}</TableBody></Table></div>{!isCancelled && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})} disabled={isCancelled}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>}</CardContent></Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card><CardHeader><CardTitle className="text-base">หมายเหตุ</CardTitle></CardHeader><CardContent><FormField control={form.control} name="notes" render={({ field }) => (<Textarea {...field} value={field.value || ""} rows={5} disabled={isCancelled} />)} /></CardContent></Card><div className="space-y-4"><div className="space-y-2 p-4 border rounded-lg bg-muted/30"><div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div><div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">ส่วนลด (บาท)</span><FormField control={form.control} name="discountAmount" render={({ field }) => (<Input type="number" step="any" className="w-32 text-right bg-background h-8" {...field} disabled={isCancelled} />)}/></div><Separator/><div className="flex justify-between items-center text-lg font-bold"><span >ยอดรวมสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div></div></div></div>
        <div className="flex justify-end gap-4"><Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button><Button type="submit" disabled={isFormLoading || isCancelled}>{isFormLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}{isEditing ? 'บันทึกการแก้ไข' : 'บันทึกใบเสนอราคา'}</Button></div>
      </form>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              พบใบเสนอราคาเดิม
            </DialogTitle>
            <DialogDescription>
              งานนี้มีการออกใบเสนอราคาไปแล้วคือเลขที่ <span className="font-bold text-primary">{existingActiveDoc?.docNo}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push(`/app/office/documents/quotation/${existingActiveDoc?.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> ดูใบเดิม
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleCancelExistingAndSave} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              ยกเลิกใบเดิมและสร้างใหม่
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
