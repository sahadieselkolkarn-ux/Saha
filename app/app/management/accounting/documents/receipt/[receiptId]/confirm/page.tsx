
"use client";

import { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, writeBatch, serverTimestamp, getDocs, addDoc, getDoc } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowLeft, AlertCircle, Calculator } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document as DocumentType, AccountingAccount, AccountingObligation } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { safeFormat } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const allocationSchema = z.object({
  invoiceId: z.string(),
  invoiceDocNo: z.string(),
  grossRemaining: z.coerce.number(),
  netCashApplied: z.coerce.number().min(0),
  withholdingPercent: z.coerce.number().min(0).max(100).optional(),
  withholdingAmount: z.coerce.number().min(0).optional(),
  grossApplied: z.coerce.number().min(0),
});

const confirmReceiptSchema = z.object({
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  paymentDate: z.string().min(1, "กรุณาเลือกวันที่"),
  netReceivedTotal: z.coerce.number().min(0.01, "ยอดรับสุทธิต้องมากกว่า 0"),
  allocations: z.array(allocationSchema),
}).refine(
  (data) => {
    const totalNetApplied = data.allocations.reduce((sum, alloc) => sum + (alloc.netCashApplied || 0), 0);
    return Math.abs(totalNetApplied - data.netReceivedTotal) < 0.01;
  },
  {
    message: "ยอด Net Cash Applied รวมต้องเท่ากับยอดรับสุทธิ",
    path: ["netReceivedTotal"],
  }
).refine(
    (data) => data.allocations.every(alloc => alloc.grossApplied <= alloc.grossRemaining + 0.01), 
    {
        message: "ยอดที่จัดสรร (Gross Applied) เกินยอดค้างชำระของ Invoice",
        path: ["allocations"],
    }
);

type ConfirmReceiptFormData = z.infer<typeof confirmReceiptSchema>;
type AllocationFormData = z.infer<typeof allocationSchema>;

const formatCurrency = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ConfirmReceiptPageContent() {
  const { receiptId } = useParams();
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<WithId<DocumentType> | null>(null);
  const [invoices, setInvoices] = useState<WithId<DocumentType>[]>([]);
  const [obligations, setObligations] = useState<Record<string, WithId<AccountingObligation>>>({});
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);

  const form = useForm<ConfirmReceiptFormData>({
    resolver: zodResolver(confirmReceiptSchema),
    defaultValues: {
      allocations: [],
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const { fields, update } = useFieldArray({ control: form.control, name: "allocations" });
  const watchedAllocations = useWatch({ control: form.control, name: "allocations" });

  // Fetch initial data
  useEffect(() => {
    if (!db || !receiptId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const receiptRef = doc(db, 'documents', receiptId as string);
        const receiptSnap = await getDoc(receiptRef);

        if (!receiptSnap.exists() || receiptSnap.data().docType !== 'RECEIPT') {
          throw new Error("ไม่พบใบเสร็จรับเงิน");
        }

        const receiptData = { id: receiptSnap.id, ...receiptSnap.data() } as WithId<DocumentType>;
        if (receiptData.status === 'CONFIRMED' || receiptData.receiptStatus === 'CONFIRMED') {
          setError("ใบเสร็จนี้ถูกยืนยันการรับเงินไปแล้ว");
          setIsLoading(false);
          return;
        }
        setReceipt(receiptData);

        const invoiceIds = receiptData.referencesDocIds || [];
        if (invoiceIds.length === 0) {
            setInvoices([]);
            setObligations({});
            return;
        }

        const invoicesQuery = query(collection(db, "documents"), where("__name__", "in", invoiceIds));
        const obligationsQuery = query(collection(db, 'accountingObligations'), where('sourceDocId', 'in', invoiceIds));
        const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        
        const [invoicesSnap, obligationsSnap, accountsSnap] = await Promise.all([
            getDocs(invoicesQuery),
            getDocs(obligationsQuery),
            getDocs(accountsQuery),
        ]);

        const fetchedInvoices = invoicesSnap.docs.map(d => ({id: d.id, ...d.data()}) as WithId<DocumentType>);
        const fetchedObligations = Object.fromEntries(obligationsSnap.docs.map(d => [d.data().sourceDocId, {id: d.id, ...d.data()} as WithId<AccountingObligation>]));
        
        setInvoices(fetchedInvoices);
        setObligations(fetchedObligations);
        setAccounts(accountsSnap.docs.map(d => ({id: d.id, ...d.data()}) as WithId<AccountingAccount>));
        
        form.reset({
            accountId: accountsSnap.docs[0]?.id || "",
            paymentMethod: receiptData.paymentMethod as any || 'CASH',
            paymentDate: receiptData.paymentDate || format(new Date(), "yyyy-MM-dd"),
            netReceivedTotal: receiptData.grandTotal,
            allocations: fetchedInvoices.map(inv => {
                const ob = fetchedObligations[inv.id];
                const grossRemaining = ob?.balance ?? inv.paymentSummary?.balance ?? inv.grandTotal;
                return {
                    invoiceId: inv.id,
                    invoiceDocNo: inv.docNo,
                    grossRemaining,
                    netCashApplied: 0,
                    withholdingAmount: 0,
                    grossApplied: 0,
                };
            })
        });

      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [db, receiptId, form]);
  
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
      const grossRemaining = alloc.grossRemaining;
      const amountToApply = Math.min(remainingToAllocate, grossRemaining);
      remainingToAllocate -= amountToApply;
      return { ...alloc, netCashApplied: amountToApply, withholdingAmount: 0, withholdingPercent: 0 };
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

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name && name.startsWith('allocations')) {
        const parts = name.split('.');
        if (parts.length >= 2) {
          const index = parseInt(parts[1], 10);
          const currentAlloc = form.getValues(`allocations.${index}`);
          if (!currentAlloc) return;
          
          let { netCashApplied, withholdingPercent, withholdingAmount, grossApplied } = currentAlloc;
          netCashApplied = netCashApplied || 0;
          withholdingPercent = withholdingPercent || 0;
          withholdingAmount = withholdingAmount || 0;

          if(parts[2] === 'netCashApplied') {
             if(withholdingPercent > 0) {
                 grossApplied = netCashApplied / (1 - (withholdingPercent / 100));
                 withholdingAmount = grossApplied - netCashApplied;
             } else {
                 grossApplied = netCashApplied + withholdingAmount;
             }
          } else if (parts[2] === 'withholdingPercent') {
             grossApplied = netCashApplied / (1 - (withholdingPercent / 100));
             withholdingAmount = grossApplied - netCashApplied;
          } else if (parts[2] === 'withholdingAmount') {
             grossApplied = netCashApplied + withholdingAmount;
             if (grossApplied > 0) {
                withholdingPercent = (withholdingAmount / grossApplied) * 100;
             } else {
                withholdingPercent = 0;
             }
          }

          update(index, {
            ...currentAlloc,
            withholdingPercent: round(withholdingPercent, 4),
            withholdingAmount: round(withholdingAmount, 2),
            grossApplied: round(grossApplied, 2),
          });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, update]);
  
  const round = (value: number, decimals: number) => {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  }

  const totals = useMemo(() => {
    const totalNetApplied = watchedAllocations.reduce((sum, a) => sum + (a.netCashApplied || 0), 0);
    const totalWht = watchedAllocations.reduce((sum, a) => sum + (a.withholdingAmount || 0), 0);
    const totalGrossApplied = watchedAllocations.reduce((sum, a) => sum + (a.grossApplied || 0), 0);
    const remainingToAllocate = (form.getValues('netReceivedTotal') || 0) - totalNetApplied;
    return { totalNetApplied, totalWht, totalGrossApplied, remainingToAllocate };
  }, [watchedAllocations, form]);

  const onSubmit = async (data: ConfirmReceiptFormData) => {
    if (!db || !profile || !receipt) return;
    setIsLoading(true);
    try {
        const batch = writeBatch(db);
        
        // 1. Create AR Payment record
        const arPaymentRef = doc(collection(db, 'arPayments'));
        batch.set(arPaymentRef, {
            receiptId,
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
        
        // 2. Create Accounting Entry
        const entryRef = doc(collection(db, 'accountingEntries'));
        batch.set(entryRef, {
            entryType: 'RECEIPT',
            entryDate: data.paymentDate,
            amount: data.netReceivedTotal,
            accountId: data.accountId,
            paymentMethod: data.paymentMethod,
            sourceDocType: 'RECEIPT',
            sourceDocId: receiptId,
            sourceDocNo: receipt.docNo,
            createdAt: serverTimestamp(),
        });
        
        // 3. Update the RECEIPT document status
        batch.update(doc(db, 'documents', receiptId as string), {
            status: 'CONFIRMED',
            receiptStatus: 'CONFIRMED',
            confirmedPayment: {
                accountId: data.accountId,
                method: data.paymentMethod,
                receivedDate: data.paymentDate,
                netReceivedTotal: data.netReceivedTotal,
                withholdingTotal: totals.totalWht,
                arPaymentId: arPaymentRef.id,
            },
            updatedAt: serverTimestamp(),
        });
        
        // 4. Update the source invoices (DN/TI/BN)
        for (const alloc of data.allocations) {
            if (alloc.grossApplied > 0) {
                const ob = obligations[alloc.invoiceId];
                if (ob) {
                    const newBalance = ob.balance - alloc.grossApplied;
                    const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';
                    
                    // Update the Obligation
                    batch.update(doc(db, 'accountingObligations', ob.id), {
                        amountPaid: ob.amountPaid + alloc.grossApplied,
                        balance: newBalance,
                        status: newStatus,
                        lastPaymentDate: data.paymentDate,
                        paidOffDate: newStatus === 'PAID' ? data.paymentDate : null,
                    });

                    // STEP 3: Sync back to source document (Invoice) - This is the SINGLE point of update for balances
                    batch.update(doc(db, 'documents', alloc.invoiceId), {
                        status: newStatus,
                        arStatus: newStatus,
                        receiptStatus: 'CONFIRMED',
                        paymentSummary: {
                            paidTotal: ob.amountPaid + alloc.grossApplied,
                            balance: newBalance,
                            paymentStatus: newStatus
                        },
                        updatedAt: serverTimestamp(),
                    });
                }
            }
        }
        
        await batch.commit();
        toast({ title: "ยืนยันการรับเงินสำเร็จ" });
        router.push('/app/management/accounting/inbox');

    } catch (err: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: err.message });
    } finally {
        setIsLoading(false);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;
  if (error) return <PageHeader title="ผิดพลาด" description={error} />;

  return (
    <>
        <PageHeader title="ยืนยันรับเงินเข้าบัญชี" description={`สำหรับใบเสร็จเลขที่: ${receipt?.docNo}`} />
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> กลับ</Button>
                    <Button type="submit" disabled={isLoading}><Save/> ยืนยัน</Button>
                </div>
                
                <Card>
                    <CardHeader><CardTitle className="text-base">1. สรุปยอดรับเงิน</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-3 gap-4">
                        <FormField name="paymentDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่รับเงิน</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="paymentMethod" control={form.control} render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select></FormItem>)} />
                        <FormField name="accountId" control={form.control} render={({ field }) => (<FormItem><FormLabel>เข้าบัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                        <div className="md:col-span-3">
                            <FormField name="netReceivedTotal" control={form.control} render={({ field }) => (<FormItem><FormLabel>ยอดรับสุทธิ (Net)</FormLabel><FormControl><Input type="number" {...field} className="text-lg font-bold" /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle className="text-base">2. จัดสรรยอดเงิน</CardTitle>
                        <Button type="button" variant="secondary" onClick={handleAutoAllocate}><Calculator/> จัดสรรอัตโนมัติ</Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead className="text-right">ยอดค้าง</TableHead><TableHead className="w-40 text-right">Net Cash Applied</TableHead><TableHead className="w-28 text-right">WHT %</TableHead><TableHead className="w-36 text-right">WHT Amt</TableHead><TableHead className="w-40 text-right">Gross Applied</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                        <TableCell>{field.invoiceDocNo}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(field.grossRemaining)}</TableCell>
                                        <TableCell><FormField control={form.control} name={`allocations.${index}.netCashApplied`} render={({ field }) => (<Input type="number" className="text-right" {...field} />)} /></TableCell>
                                        <TableCell><FormField control={form.control} name={`allocations.${index}.withholdingPercent`} render={({ field }) => (<Input type="number" className="text-right" {...field} placeholder="เช่น 3"/>)} /></TableCell>
                                        <TableCell><FormField control={form.control} name={`allocations.${index}.withholdingAmount`} render={({ field }) => (<Input type="number" className="text-right" {...field} />)} /></TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(field.grossApplied)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={4}>ยอดที่ยังไม่ได้จัดสรร:</TableCell>
                                    <TableCell colSpan={2} className={cn("text-right font-bold", Math.abs(totals.remainingToAllocate) > 0.01 ? 'text-destructive' : 'text-green-600')}>{formatCurrency(totals.remainingToAllocate)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </form>
        </Form>
    </>
  );
}

export default function ConfirmReceiptPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
            <ConfirmReceiptPageContent />
        </Suspense>
    );
}
