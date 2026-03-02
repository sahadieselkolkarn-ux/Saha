"use client";

import { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, query, where, writeBatch, serverTimestamp, getDocs, getDoc, runTransaction } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useFirebase, useDoc } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowLeft, Calculator, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document as DocumentType, AccountingAccount, AccountingObligation } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";
import { safeFormat } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
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

const allocationSchema = z.object({
  invoiceId: z.string(),
  invoiceDocNo: z.string(),
  grossRemaining: z.coerce.number(),
  withTax: z.boolean().default(false),
  netCashApplied: z.coerce.number().min(0, "ยอดเงินห้ามติดลบ"),
  withholdingPercent: z.coerce.number().min(0).max(100).optional(),
  withholdingAmount: z.coerce.number().min(0).optional(),
  grossApplied: z.coerce.number().min(0),
});

const confirmReceiptSchema = z.object({
  accountId: z.string().min(1, "กรุณาเลือกบัญชีที่รับเงิน"),
  paymentDate: z.string().min(1, "กรุณาเลือกวันที่รับเงินจริง"),
  netReceivedTotal: z.coerce.number().min(0.01, "ยอดรับสุทธิต้องมากกว่า 0"),
  allocations: z.array(allocationSchema),
}).refine(
  (data) => {
    const totalNetApplied = data.allocations.reduce((sum, alloc) => sum + (alloc.netCashApplied || 0), 0);
    return Math.abs(totalNetApplied - data.netReceivedTotal) < 0.01;
  },
  {
    message: "ยอดเงินที่จัดสรรรวมต้องเท่ากับยอดรับสุทธิ",
    path: ["netReceivedTotal"],
  }
).refine(
    (data) => data.allocations.every(alloc => alloc.grossApplied <= alloc.grossRemaining + 0.01), 
    {
        message: "มียอดจัดสรรเกินยอดค้างชำระของบิลอ้างอิง",
        path: ["allocations"],
    }
);

type ConfirmReceiptFormData = z.infer<typeof confirmReceiptSchema>;

const formatCurrency = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ConfirmReceiptPageContent() {
  const { receiptId } = useParams();
  const router = useRouter();
  const { db, app: firebaseApp } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<WithId<DocumentType> | null>(null);
  const [invoices, setInvoices] = useState<WithId<DocumentType>[]>([]);
  const [obligations, setObligations] = useState<Record<string, WithId<AccountingObligation>>>({});
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<ConfirmReceiptFormData | null>(null);

  const form = useForm<ConfirmReceiptFormData>({
    resolver: zodResolver(confirmReceiptSchema),
    defaultValues: {
      allocations: [],
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const { fields, update } = useFieldArray({ control: form.control, name: "allocations" });
  const watchedAllocations = useWatch({ control: form.control, name: "allocations" });

  useEffect(() => {
    if (!db || !receiptId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const receiptRef = doc(db, 'documents', receiptId as string);
        const receiptSnap = await getDoc(receiptRef);

        if (!receiptSnap.exists() || receiptSnap.data().docType !== 'RECEIPT') {
          throw new Error("ไม่พบข้อมูลใบเสร็จรับเงินที่ต้องการ");
        }

        const receiptData = { id: receiptSnap.id, ...receiptSnap.data() } as WithId<DocumentType>;
        if (receiptData.status === 'CONFIRMED' || receiptData.receiptStatus === 'CONFIRMED') {
          setError("ใบเสร็จนี้ถูกยืนยันการรับเงินไปก่อนหน้านี้แล้ว");
          setIsLoading(false);
          return;
        }
        setReceipt(receiptData);

        let invoiceIds = receiptData.referencesDocIds || [];
        let fetchedInvoices: WithId<DocumentType>[] = [];
        let fetchedObligations: Record<string, WithId<AccountingObligation>> = {};

        if (invoiceIds.length > 0) {
            // First check if any reference is a Billing Note
            const firstRefId = invoiceIds[0];
            const sourceDocSnap = await getDoc(doc(db, 'documents', firstRefId));
            if (sourceDocSnap.exists() && sourceDocSnap.data().docType === 'BILLING_NOTE') {
                invoiceIds = sourceDocSnap.data().invoiceIds || [];
            }

            if (invoiceIds.length > 0) {
                const invoicesQuery = query(collection(db, "documents"), where("__name__", "in", invoiceIds));
                const obligationsQuery = query(collection(db, 'accountingObligations'), where('sourceDocId', 'in', invoiceIds));
                
                const [invoicesSnap, obligationsSnap] = await Promise.all([
                    getDocs(invoicesQuery),
                    getDocs(obligationsQuery),
                ]);

                fetchedInvoices = invoicesSnap.docs.map(d => ({id: d.id, ...d.data()}) as WithId<DocumentType>);
                fetchedObligations = Object.fromEntries(obligationsSnap.docs.map(d => [d.data().sourceDocId, {id: d.id, ...d.data()} as WithId<AccountingObligation>]));
            }
        }

        setInvoices(fetchedInvoices);
        setObligations(fetchedObligations);

        const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        const accountsSnap = await getDocs(accountsQuery);
        const accountsData = accountsSnap.docs.map(d => ({id: d.id, ...d.data()}) as WithId<AccountingAccount>);
        setAccounts(accountsData);
        
        form.reset({
            accountId: receiptData.receivedAccountId || accountsData[0]?.id || "",
            paymentDate: receiptData.paymentDate || format(new Date(), "yyyy-MM-dd"),
            netReceivedTotal: Math.round(receiptData.grandTotal * 100) / 100,
            allocations: fetchedInvoices.map(inv => {
                const ob = fetchedObligations[inv.id];
                const grossRemaining = Math.round((ob?.balance ?? inv.paymentSummary?.balance ?? inv.grandTotal) * 100) / 100;
                return {
                    invoiceId: inv.id,
                    invoiceDocNo: inv.docNo,
                    grossRemaining,
                    withTax: inv.withTax ?? false,
                    netCashApplied: 0,
                    withholdingAmount: 0,
                    withholdingPercent: inv.docType === 'TAX_INVOICE' ? 3 : 0,
                    grossApplied: 0,
                };
            })
        });

      } catch (err: any) {
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [db, receiptId, form]);
  
  // Adjusted Auto Allocation Logic
  const handleAutoAllocate = useCallback(() => {
    const netTotal = form.getValues('netReceivedTotal');
    let remainingToAllocate = netTotal;
    const currentAllocations = form.getValues('allocations');
    
    const sortedAllocations = [...currentAllocations].sort((a,b) => {
        const invA = invoices.find(i => i.id === a.invoiceId);
        const invB = invoices.find(i => i.id === b.invoiceId);
        return new Date(invA?.docDate || 0).getTime() - new Date(invB?.docDate || 0).getTime();
    });

    const newAllocations = sortedAllocations.map(alloc => {
      const { grossRemaining, withTax, withholdingPercent = 0 } = alloc;
      
      // Calculate how much gross we CAN settle with the remaining cash
      // Formulas based on Gross -> Net
      // Base = Gross / 1.07 (if tax)
      // WHT = Base * rate
      // Net = Gross - WHT
      // So Net = Gross - (Gross / 1.07 * rate) = Gross * (1 - rate/1.07)
      // Gross = Net / (1 - rate/1.07)
      
      const rate = withholdingPercent / 100;
      const divisor = withTax ? (1 - (rate / 1.07)) : (1 - rate);
      
      let amountToApplyNet = Math.round(Math.min(remainingToAllocate, grossRemaining * (withTax ? (1 - (rate / 1.07)) : (1 - rate))) * 100) / 100;
      
      const grossApplied = Math.round((amountToApplyNet / divisor) * 100) / 100;
      const baseAmount = withTax ? Math.round((grossApplied / 1.07) * 100) / 100 : grossApplied;
      const whtAmount = Math.round((baseAmount * rate) * 100) / 100;
      const finalNetApplied = Math.round((grossApplied - whtAmount) * 100) / 100;

      remainingToAllocate = Math.round((remainingToAllocate - finalNetApplied) * 100) / 100;
      
      return { 
        ...alloc, 
        netCashApplied: finalNetApplied, 
        withholdingAmount: whtAmount, 
        grossApplied: grossApplied 
      };
    });

    newAllocations.forEach(newAlloc => {
        const originalIndex = form.getValues('allocations').findIndex(a => a.invoiceId === newAlloc.invoiceId);
        if (originalIndex !== -1) {
            update(originalIndex, newAlloc);
        }
    });

    if (remainingToAllocate > 0.01) {
        toast({
            variant: "default",
            title: "ยอดเงินคงเหลือ",
            description: `มีเงินคงเหลือ ${formatCurrency(remainingToAllocate)} บาท ที่ยังไม่ได้จัดสรร`,
        });
    }
  }, [form, invoices, toast, update]);

  // Real-time calculation watcher with VAT-aware WHT logic
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name && name.startsWith('allocations')) {
        const parts = name.split('.');
        if (parts.length >= 2) {
          const index = parseInt(parts[1], 10);
          const currentAlloc = form.getValues(`allocations.${index}`);
          if (!currentAlloc) return;
          
          let { netCashApplied, withholdingPercent, withholdingAmount, grossApplied, withTax } = currentAlloc;
          netCashApplied = Number(netCashApplied) || 0;
          withholdingPercent = Number(withholdingPercent) || 0;
          const rate = withholdingPercent / 100;

          // If changing Net Cash Applied or WHT %
          if (parts[2] === 'netCashApplied' || parts[2] === 'withholdingPercent') {
             // Formula: Net = Gross - (Base * Rate)
             // If Tax: Net = Gross - (Gross / 1.07 * Rate) = Gross * (1 - Rate/1.07)
             // Gross = Net / (1 - Rate/1.07)
             
             const divisor = withTax ? (1 - (rate / 1.07)) : (1 - rate);
             grossApplied = Math.round((netCashApplied / divisor) * 100) / 100;
             const baseAmount = withTax ? Math.round((grossApplied / 1.07) * 100) / 100 : grossApplied;
             withholdingAmount = Math.round((baseAmount * rate) * 100) / 100;
             
             // Recalculate net to ensure rounding consistency
             netCashApplied = Math.round((grossApplied - withholdingAmount) * 100) / 100;
          } 
          // If changing WHT Amount directly
          else if (parts[2] === 'withholdingAmount') {
             grossApplied = Math.round((netCashApplied + withholdingAmount) * 100) / 100;
             const baseAmount = withTax ? Math.round((grossApplied / 1.07) * 100) / 100 : grossApplied;
             if (baseAmount > 0) {
                withholdingPercent = Math.round(((withholdingAmount / baseAmount) * 100) * 10000) / 10000;
             } else {
                withholdingPercent = 0;
             }
          }

          update(index, {
            ...currentAlloc,
            netCashApplied: Number(netCashApplied),
            withholdingPercent: Number(Number(withholdingPercent).toFixed(4)),
            withholdingAmount: Number(Number(withholdingAmount).toFixed(2)),
            grossApplied: Number(Number(grossApplied).toFixed(2)),
          });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, update]);
  
  const totals = useMemo(() => {
    const totalNetApplied = Math.round(watchedAllocations.reduce((sum, a) => sum + (a.netCashApplied || 0), 0) * 100) / 100;
    const totalWht = Math.round(watchedAllocations.reduce((sum, a) => sum + (a.withholdingAmount || 0), 0) * 100) / 100;
    const totalGrossApplied = Math.round(watchedAllocations.reduce((sum, a) => sum + (a.grossApplied || 0), 0) * 100) / 100;
    const remainingToAllocate = Math.round(((form.getValues('netReceivedTotal') || 0) - totalNetApplied) * 100) / 100;
    return { totalNetApplied, totalWht, totalGrossApplied, remainingToAllocate };
  }, [watchedAllocations, form]);

  const callCloseJobFunction = async (jobId: string, paymentStatus: 'PAID' | 'UNPAID' = 'PAID') => {
    if (!firebaseApp) return;
    const functions = getFunctions(firebaseApp, 'us-central1');
    const closeJob = httpsCallable(functions, "closeJobAfterAccounting");
    try {
      await closeJob({ jobId, paymentStatus });
    } catch (e) {
      console.error("Failed to archive job:", jobId, e);
    }
  };

  const executeSubmit = async (data: ConfirmReceiptFormData) => {
    if (!db || !profile || !receipt) return;
    setIsLoading(true);
    const jobsToArchive: string[] = [];

    try {
        await runTransaction(db, async (transaction) => {
            const receiptRef = doc(db, 'documents', receipt.id);
            const receiptSnap = await transaction.get(receiptRef);
            
            if (!receiptSnap.exists()) throw new Error("ไม่พบใบเสร็จในระบบ");
            
            if (receiptSnap.data().status === 'CONFIRMED' || receiptSnap.data().receiptStatus === 'CONFIRMED' || receiptSnap.data().accountingEntryId) {
                throw new Error("รายการนี้ถูกยืนยันไปก่อนหน้านี้แล้ว");
            }

            const account = accounts.find(a => a.id === data.accountId);
            if (!account) throw new Error("ไม่พบข้อมูลบัญชีที่เลือก");
            const paymentMethod = account.type === 'CASH' ? 'CASH' : 'TRANSFER';

            const arPaymentId = `ARPAY_${receipt.id}`;
            const arPaymentRef = doc(db, 'arPayments', arPaymentId);
            
            const entryId = `RECEIPT_${receipt.id}`;
            const entryRef = doc(db, 'accountingEntries', entryId);

            transaction.set(arPaymentRef, {
                id: arPaymentId,
                receiptId: receipt.id,
                customerId: receipt.customerId,
                paymentDate: data.paymentDate,
                netReceivedTotal: data.netReceivedTotal,
                withholdingTotal: totals.totalWht,
                allocations: data.allocations.filter(a => a.grossApplied > 0).map(a => ({
                    invoiceId: a.invoiceId,
                    invoiceDocNo: a.invoiceDocNo,
                    netCashApplied: a.netCashApplied,
                    withholdingAmount: a.withholdingAmount,
                    grossApplied: a.grossApplied,
                })),
                createdAt: serverTimestamp(),
            });
            
            transaction.set(entryRef, {
                entryType: 'RECEIPT',
                entryDate: data.paymentDate,
                amount: data.netReceivedTotal,
                accountId: data.accountId,
                paymentMethod: paymentMethod,
                sourceDocType: 'RECEIPT',
                sourceDocId: receipt.id,
                sourceDocNo: receipt.docNo,
                createdAt: serverTimestamp(),
            });
            
            transaction.update(receiptRef, {
                status: 'CONFIRMED',
                receiptStatus: 'CONFIRMED',
                accountingEntryId: entryId,
                confirmedPayment: {
                    accountId: data.accountId,
                    method: paymentMethod,
                    receivedDate: data.paymentDate,
                    netReceivedTotal: data.netReceivedTotal,
                    withholdingTotal: totals.totalWht,
                    arPaymentId: arPaymentId,
                },
                updatedAt: serverTimestamp(),
            });
            
            for (const alloc of data.allocations) {
                if (alloc.grossApplied > 0) {
                    const ob = obligations[alloc.invoiceId];
                    if (ob) {
                        const newBalance = Math.max(0, Math.round((ob.balance - alloc.grossApplied) * 100) / 100);
                        const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';
                        
                        transaction.update(doc(db, 'accountingObligations', ob.id), {
                            amountPaid: Math.round(((ob.amountPaid || 0) + alloc.grossApplied) * 100) / 100,
                            balance: newBalance,
                            status: newStatus,
                            lastPaymentDate: data.paymentDate,
                            paidOffDate: newStatus === 'PAID' ? data.paymentDate : null,
                            updatedAt: serverTimestamp(),
                        });

                        transaction.update(doc(db, 'documents', alloc.invoiceId), {
                            status: newStatus,
                            arStatus: newStatus,
                            paymentSummary: {
                                paidTotal: Math.round(((ob.amountPaid || 0) + alloc.grossApplied) * 100) / 100,
                                balance: newBalance,
                                paymentStatus: newStatus
                            },
                            updatedAt: serverTimestamp(),
                        });

                        if (newStatus === 'PAID' && ob.jobId) {
                            jobsToArchive.push(ob.jobId);
                        }
                    }
                }
            }
        });
        
        if (jobsToArchive.length > 0) {
            const uniqueJobs = Array.from(new Set(jobsToArchive));
            for (const jId of uniqueJobs) {
                await callCloseJobFunction(jId, 'PAID');
            }
        }

        toast({ title: "ยืนยันการรับเงินสำเร็จ", description: jobsToArchive.length > 0 ? `ปิดงานซ่อมที่เกี่ยวข้อง ${jobsToArchive.length} รายการเรียบร้อยค่ะ` : "" });
        router.push('/app/management/accounting/inbox');

    } catch (err: any) {
        toast({ variant: 'destructive', title: "ไม่สามารถยืนยันได้", description: err.message });
    } finally {
        setIsLoading(false);
    }
  };

  const handlePreSubmit = (data: ConfirmReceiptFormData) => {
      setPendingFormData(data);
      setShowFinalConfirm(true);
  }

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;
  if (error) return <PageHeader title="เกิดข้อผิดพลาด" description={error} />;

  return (
    <>
        <PageHeader title="ยืนยันรับเงินเข้าบัญชี" description={`สำหรับใบเสร็จเลขที่: ${receipt?.docNo}`} />
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handlePreSubmit)} className="space-y-6">
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
                    <Button type="submit" disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                        <Save className="mr-2 h-4 w-4"/> ยืนยันข้อมูล
                    </Button>
                </div>
                
                <Card>
                    <CardHeader><CardTitle className="text-base">1. สรุปยอดรับเงิน</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4">
                        <FormField name="paymentDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่รับเงินจริง</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="accountId" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel>เข้าบัญชี</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl>
                              <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type === 'CASH' ? 'เงินสด' : 'โอน'})</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="md:col-span-2">
                            <FormField name="netReceivedTotal" control={form.control} render={({ field }) => (<FormItem><FormLabel>ยอดรับสุทธิ (Net Received)</FormLabel><FormControl><Input type="number" {...field} className="text-lg font-bold" /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle className="text-base">2. จัดสรรยอดเงินตามบิล</CardTitle>
                        <Button type="button" variant="secondary" onClick={handleAutoAllocate}><Calculator className="mr-2 h-4 w-4"/> จัดสรรอัตโนมัติ</Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert variant="secondary" className="bg-blue-50 border-blue-200">
                            <Info className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-800">คำแนะนำการคำนวณหัก ณ ที่จ่าย</AlertTitle>
                            <AlertDescription className="text-blue-700 text-xs">
                                สำหรับบิลใบกำกับภาษี (VAT 7%) ระบบจะคำนวณภาษีหัก ณ ที่จ่ายจาก **ยอดก่อน VAT** ให้อัตโนมัติค่ะ 
                                (ยอดเงินรับจริง = ยอดรวมบิล - ยอดหัก ณ ที่จ่าย)
                            </AlertDescription>
                        </Alert>

                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="min-w-[150px]">เลขที่ Invoice</TableHead>
                                        <TableHead className="text-right">ยอดค้าง</TableHead>
                                        <TableHead className="w-32 text-right">รับจริง (Net)</TableHead>
                                        <TableHead className="w-20 text-right">หัก (%)</TableHead>
                                        <TableHead className="w-32 text-right">ยอด WHT</TableHead>
                                        <TableHead className="w-32 text-right">ตัดหนี้รวม (Gross)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field, index) => (
                                        <TableRow key={field.id} className="hover:bg-transparent">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{field.invoiceDocNo}</span>
                                                    {field.withTax && <Badge variant="outline" className="w-fit text-[8px] h-3 px-1 border-blue-200 text-blue-600">VAT 7%</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-mono">{formatCurrency(field.grossRemaining)}</TableCell>
                                            <TableCell><FormField control={form.control} name={`allocations.${index}.netCashApplied`} render={({ field }) => (<Input type="number" className="text-right h-8 font-bold" {...field} />)} /></TableCell>
                                            <TableCell><FormField control={form.control} name={`allocations.${index}.withholdingPercent`} render={({ field }) => (<Input type="number" className="text-right h-8" {...field} placeholder="3"/>)} /></TableCell>
                                            <TableCell className="text-right text-xs text-destructive font-medium">-{formatCurrency(watchedAllocations[index]?.withholdingAmount || 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-primary">{formatCurrency(watchedAllocations[index]?.grossApplied || 0)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="bg-muted/20">
                                        <TableCell colSpan={4} className="text-xs text-muted-foreground italic">
                                            ยอดเงินคงเหลือที่ยังไม่ได้จัดสรร:
                                        </TableCell>
                                        <TableCell colSpan={2} className={cn("text-right font-black text-lg", Math.abs(totals.remainingToAllocate) > 0.01 ? 'text-destructive' : 'text-green-600')}>
                                            ฿{formatCurrency(totals.remainingToAllocate)}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </Form>

        <AlertDialog open={showFinalConfirm} onOpenChange={setShowFinalConfirm}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>ยืนยันข้อมูลการรับเงินและจัดสรรหนี้?</AlertDialogTitle>
                    <AlertDialogDescription>
                        เมื่อยืนยันแล้ว ระบบจะ <span className="font-bold text-destructive">ลงบัญชีรายรับ ปรับยอดลูกหนี้ และปิดงานซ่อมที่เกี่ยวข้องทันที</span> โดยไม่สามารถแก้ไขได้อีก
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction onClick={() => pendingFormData && executeSubmit(pendingFormData)} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} ตกลง ยืนยันข้อมูล
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}

export default function ConfirmReceiptPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}>
            <ConfirmReceiptPageContent />
        </Suspense>
    );
}
