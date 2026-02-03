"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ChevronsUpDown, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

import { createDocument } from "@/firebase/documents";
import type { StoreSettings, Customer, Document as DocumentType, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

const receiptFormSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  sourceDocId: z.string().min(1, "กรุณาเลือกเอกสารอ้างอิง"),
  paymentDate: z.string().min(1, "กรุณาเลือกวันที่ชำระเงิน"),
  paymentMethod: z.enum(["CASH", "TRANSFER", "CREDIT"], { required_error: "กรุณาเลือกช่องทางการชำระเงิน" }),
  accountId: z.string().min(1, "กรุณาเลือกบัญชีที่รับเงิน"),
  amount: z.coerce.number().min(0.01, "ยอดเงินต้องมากกว่า 0"),
  notes: z.string().optional(),
});

type ReceiptFormData = z.infer<typeof receiptFormSchema>;

export function ReceiptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sourceDocs, setSourceDocs] = useState<DocumentType[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);

  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const { data: storeSettings } = useDoc<StoreSettings>(storeSettingsRef);

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: 'CASH',
      amount: 0,
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const selectedSourceDocId = form.watch('sourceDocId');

  // Handle URL params
  useEffect(() => {
    const cId = searchParams.get('customerId');
    const sId = searchParams.get('sourceDocId');
    if (cId) form.setValue('customerId', cId);
    if (sId) form.setValue('sourceDocId', sId);
  }, [searchParams, form]);

  // Fetch customers
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoading(false);
    }, () => setIsLoading(false));
    return unsubscribe;
  }, [db]);
  
  // Fetch accounts
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountingAccount)));
    });
    return unsubscribe;
  }, [db]);

  // Fetch source documents for selected customer
  useEffect(() => {
    if (!db || !selectedCustomerId) {
      setSourceDocs([]);
      return;
    }
    const q = query(
      collection(db, "documents"),
      where("customerId", "==", selectedCustomerId),
      where("docType", "in", ["TAX_INVOICE", "BILLING_NOTE", "DELIVERY_NOTE"]),
      where("status", "in", ["UNPAID", "PARTIAL", "DRAFT", "PENDING_REVIEW"])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentType));
      
      // Enforce Billing Policy: Hide TAX_INVOICE if it requires billing
      const filtered = allDocs.filter(doc => {
          if (doc.docType === 'TAX_INVOICE' && doc.billingRequired) {
              return false;
          }
          return true;
      });

      setSourceDocs(filtered);
    });
    return unsubscribe;
  }, [db, selectedCustomerId]);
  
  // Auto-fill amount when a source doc is selected
  useEffect(() => {
    const selectedDoc = sourceDocs.find(d => d.id === selectedSourceDocId);
    if (selectedDoc) {
      const balance = selectedDoc.paymentSummary?.balance ?? selectedDoc.grandTotal;
      form.setValue('amount', balance);
    }
  }, [selectedSourceDocId, sourceDocs, form]);

  const onSubmit = async (data: ReceiptFormData) => {
    const customer = customers.find(c => c.id === data.customerId);
    const sourceDoc = sourceDocs.find(d => d.id === data.sourceDocId);
    if (!db || !customer || !storeSettings || !profile || !sourceDoc) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "ไม่สามารถสร้างใบเสร็จได้" });
      return;
    }
    
    const items = [{
      description: `ชำระค่าสินค้า/บริการ ตาม ${sourceDoc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : sourceDoc.docType === 'BILLING_NOTE' ? 'ใบวางบิล' : 'ใบส่งของ'} เลขที่ ${sourceDoc.docNo}`,
      quantity: 1,
      unitPrice: data.amount,
      total: data.amount
    }];

    try {
      const docData = {
        docDate: data.paymentDate,
        customerId: data.customerId,
        customerSnapshot: { ...customer },
        storeSnapshot: { ...storeSettings },
        items,
        subtotal: data.amount,
        discountAmount: 0,
        net: data.amount,
        withTax: sourceDoc.withTax,
        vatAmount: sourceDoc.withTax ? (data.amount / 1.07) * 0.07 : 0,
        grandTotal: data.amount,
        notes: data.notes,
        referencesDocIds: [data.sourceDocId],
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate,
        receivedAccountId: data.accountId,
      };

      const { docId, docNo } = await createDocument(db, 'RECEIPT', docData, profile);

      // STEP 1: Update source document to link this receipt and mark as issued
      const sourceDocRef = doc(db, 'documents', data.sourceDocId);
      await updateDoc(sourceDocRef, {
          receiptStatus: 'ISSUED_NOT_CONFIRMED',
          updatedAt: serverTimestamp()
      });

      toast({ title: "สร้างใบเสร็จสำเร็จ", description: `เลขที่: ${docNo}` });
      
      // STEP 2: Redirect to confirm receipt
      router.push(`/app/management/accounting/documents/receipt/${docId}/confirm`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  }, [customers, customerSearch]);

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
            บันทึกใบเสร็จ
            </Button>
        </div>
        <Card>
            <CardHeader><CardTitle>1. เลือกเอกสารอ้างอิง</CardTitle></CardHeader>
            <CardContent className="space-y-4">
            <FormField name="customerId" render={({ field }) => (
                <FormItem>
                    <FormLabel>ลูกค้า</FormLabel>
                    <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                        <FormControl>
                        <Button variant="outline" role="combobox" className="w-[300px] justify-between">
                            {field.value ? customers.find(c => c.id === field.value)?.name : "เลือกลูกค้า..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                        <Input placeholder="ค้นหา..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="m-2 w-[calc(100%-1rem)]" />
                        <ScrollArea className="h-60">
                        {filteredCustomers.map(c => (
                            <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start">{c.name}</Button>
                        ))}
                        </ScrollArea>
                    </PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
            )} />
            {selectedCustomerId && (
                <div className="space-y-4">
                    <FormField name="sourceDocId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>เอกสารอ้างอิง (ใบกำกับภาษี/ใบวางบิล/ใบส่งของ)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger className="w-full md:w-[400px]"><SelectValue placeholder="เลือกเอกสาร..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {sourceDocs.length > 0 ? sourceDocs.map(doc => (
                            <SelectItem key={doc.id} value={doc.id}>
                                {doc.docNo} - {safeFormat(new Date(doc.docDate), "dd/MM/yy")} - ยอดค้าง: {(doc.paymentSummary?.balance ?? doc.grandTotal).toLocaleString()}
                            </SelectItem>
                            )) : <div className="p-4 text-sm text-muted-foreground text-center">ไม่พบเอกสารที่ออกใบเสร็จได้</div>}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )} />
                    
                    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p>หมายเหตุ: ใบกำกับภาษีที่ระบุว่า "ต้องวางบิล" จะไม่ปรากฏในรายการนี้ กรุณาเลือกอ้างอิงจาก "ใบวางบิล" แทน</p>
                    </div>
                </div>
            )}
            </CardContent>
        </Card>

        {selectedSourceDocId && (
        <Card>
            <CardHeader><CardTitle>2. รายละเอียดการชำระเงิน</CardTitle></CardHeader>
            <CardContent className="space-y-4">
            <FormField name="paymentDate" render={({ field }) => (<FormItem className="w-[300px]"><FormLabel>วันที่ชำระเงิน</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField name="amount" render={({ field }) => (<FormItem className="w-[300px]"><FormLabel>ยอดที่ชำระ</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
                <FormField name="paymentMethod" render={({ field }) => (
                    <FormItem>
                        <FormLabel>ช่องทาง</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="CASH">เงินสด</SelectItem>
                                <SelectItem value="TRANSFER">โอน</SelectItem>
                                <SelectItem value="CREDIT">เครดิต</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField name="accountId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>เข้าบัญชี</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl>
                            <SelectContent>
                                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
            </CardContent>
        </Card>
        )}
      </form>
    </Form>
  );
}
