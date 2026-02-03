"use client";

import { useMemo, Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirebase } from '@/firebase/client-provider';
import { collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp, getDoc, type FirestoreError, addDoc, limit, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from "zod";
import { format, parseISO } from 'date-fns';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, AlertCircle, HandCoins, ExternalLink, PlusCircle, ChevronsUpDown, Receipt } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { WithId } from '@/firebase/firestore/use-collection';
import type { AccountingObligation, AccountingAccount, UserProfile, Vendor, Document as DocumentType } from '@/lib/types';
import { safeFormat } from '@/lib/date-utils';

const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const arPaymentSchema = z.object({
  paymentDate: z.string().min(1, "กรุณาเลือกวันที่"),
  amount: z.coerce.number().positive("จำนวนเงินต้องมากกว่า 0"),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  notes: z.string().optional(),
  withholdingEnabled: z.boolean().default(false),
  withholdingAmount: z.coerce.number().min(0).optional(),
});

function ReceivePaymentDialog({
  obligation,
  accounts,
  isOpen,
  onClose,
}: {
  obligation: WithId<AccountingObligation>;
  accounts: WithId<AccountingAccount>[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof arPaymentSchema>>({
    resolver: zodResolver(arPaymentSchema),
    defaultValues: {
      paymentDate: new Date().toISOString().split("T")[0],
      amount: obligation.balance,
      paymentMethod: "TRANSFER",
      withholdingEnabled: false,
      withholdingAmount: 0,
      notes: "",
      accountId: accounts[0]?.id || "",
    },
  });

  useEffect(() => {
    form.reset({
      paymentDate: new Date().toISOString().split("T")[0],
      amount: obligation.balance,
      paymentMethod: "TRANSFER",
      withholdingEnabled: false,
      withholdingAmount: 0,
      notes: "",
      accountId: accounts[0]?.id || "",
    });
  }, [obligation, accounts, form]);

  const watchedAmount = form.watch('amount');
  const watchedWhtEnabled = form.watch('withholdingEnabled');
  const watchedWhtAmount = form.watch('withholdingAmount') || 0;
  const cashReceived = watchedAmount - (watchedWhtEnabled ? watchedWhtAmount : 0);

  const handleSavePayment = async (data: z.infer<typeof arPaymentSchema>) => {
    if (!db) return;
    setIsSubmitting(true);

    try {
      const batch = writeBatch(db);

      const obligationRef = doc(db, 'accountingObligations', obligation.id);
      const newAmountPaid = obligation.amountPaid + data.amount;
      const newBalance = obligation.amountTotal - newAmountPaid;
      const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';
      
      batch.update(obligationRef, {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        lastPaymentDate: data.paymentDate,
        paidOffDate: newStatus === 'PAID' ? data.paymentDate : null,
        updatedAt: serverTimestamp(),
      });
      
      const entryRef = doc(collection(db, "accountingEntries"));
      batch.set(entryRef, {
          entryType: "CASH_IN",
          entryDate: data.paymentDate,
          amount: cashReceived,
          accountId: data.accountId,
          paymentMethod: data.paymentMethod,
          description: `รับชำระหนี้จาก ${obligation.customerNameSnapshot} (อ้างอิง: ${obligation.sourceDocNo})`,
          sourceDocType: obligation.sourceDocType,
          sourceDocId: obligation.sourceDocId,
          sourceDocNo: obligation.sourceDocNo,
          customerNameSnapshot: obligation.customerNameSnapshot,
          jobId: obligation.jobId,
          createdAt: serverTimestamp(),
      });

      if (obligation.sourceDocId) {
        const sourceDocRef = doc(db, 'documents', obligation.sourceDocId);
        const sourceDocSnap = await getDoc(sourceDocRef);
        
        if (sourceDocSnap.exists()) {
            const sourceDoc = sourceDocSnap.data() as DocumentType;
            const currentPaidTotal = sourceDoc.paymentSummary?.paidTotal || 0;
            const updatedPaidTotal = currentPaidTotal + data.amount;
            const updatedBalance = sourceDoc.grandTotal - updatedPaidTotal;
            const updatedStatus = updatedBalance <= 0.01 ? 'PAID' : 'PARTIAL';

            batch.update(sourceDocRef, {
                status: updatedStatus,
                arStatus: updatedStatus,
                paymentSummary: {
                    paidTotal: updatedPaidTotal,
                    balance: updatedBalance,
                    paymentStatus: updatedStatus
                },
                paymentDate: data.paymentDate,
                paymentMethod: data.paymentMethod,
                receivedAccountId: data.accountId,
                cashReceived: cashReceived,
                withholdingEnabled: data.withholdingEnabled,
                withholdingAmount: data.withholdingAmount,
                updatedAt: serverTimestamp(),
            });
        }
      }

      await batch.commit();
      toast({ title: "บันทึกการรับชำระสำเร็จ" });
      onClose();

    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>รับชำระหนี้</DialogTitle>
          <DialogDescription>สำหรับเอกสาร: {obligation.sourceDocNo}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="payment-form" onSubmit={form.handleSubmit(handleSavePayment)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField name="paymentDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่รับเงิน</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>)} />
              <FormField name="amount" control={form.control} render={({ field }) => (<FormItem><FormLabel>จำนวนเงินที่รับ</FormLabel><FormControl><Input type="number" {...field}/></FormControl><FormMessage/></FormItem>)} />
            </div>
             <div className="grid grid-cols-2 gap-4">
              <FormField name="paymentMethod" control={form.control} render={({ field }) => (
                  <FormItem>
                      <FormLabel>ช่องทาง</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                          <SelectContent>
                              <SelectItem value="CASH">เงินสด</SelectItem>
                              <SelectItem value="TRANSFER">โอน</SelectItem>
                          </SelectContent>
                      </Select>
                      <FormMessage/>
                  </FormItem>
              )} />
              <FormField name="accountId" control={form.control} render={({ field }) => (
                  <FormItem>
                      <FormLabel>บัญชี</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl>
                          <SelectContent>
                              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                      <FormMessage/>
                  </FormItem>
              )} />
            </div>
            <div className="p-4 border rounded-md space-y-4">
              <FormField control={form.control} name="withholdingEnabled" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">มีหัก ณ ที่จ่าย</FormLabel>
                </FormItem>
              )} />
              {watchedWhtEnabled && (
                <FormField control={form.control} name="withholdingAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ยอดเงินที่ถูกหัก (WHT)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} value={field.value || 0} />
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
              )}
            </div>
            <div className="text-right space-y-1">
                <p>ยอดรับชำระ: {formatCurrency(watchedAmount)}</p>
                {watchedWhtEnabled && <p className='text-destructive'>หัก ณ ที่จ่าย: -{formatCurrency(watchedWhtAmount || 0)}</p>}
                <p className="font-bold text-lg">ยอดเงินเข้าจริง: {formatCurrency(cashReceived)}</p>
            </div>
             <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button type="submit" form="payment-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}บันทึกการรับชำระ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const apPaymentSchema = z.object({
  paymentDate: z.string().min(1, "กรุณาเลือกวันที่"),
  amount: z.coerce.number().positive("จำนวนเงินต้องมากกว่า 0"),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  notes: z.string().optional(),
});

function PayCreditorDialog({ obligation, accounts, isOpen, onClose }: { obligation: WithId<AccountingObligation>; accounts: WithId<AccountingAccount>[]; isOpen: boolean; onClose: () => void; }) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof apPaymentSchema>>({
    resolver: zodResolver(apPaymentSchema),
    defaultValues: {
      paymentDate: new Date().toISOString().split("T")[0],
      amount: obligation.balance,
      paymentMethod: "TRANSFER",
      notes: "",
      accountId: accounts[0]?.id || "",
    },
  });
  
  useEffect(() => {
    form.reset({
      paymentDate: new Date().toISOString().split("T")[0],
      amount: obligation.balance,
      paymentMethod: "TRANSFER",
      notes: "",
      accountId: accounts[0]?.id || "",
    });
  }, [obligation, accounts, form]);

  const handleSavePayment = async (data: z.infer<typeof apPaymentSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      const obligationRef = doc(db, 'accountingObligations', obligation.id);
      const newAmountPaid = obligation.amountPaid + data.amount;
      const newBalance = obligation.amountTotal - newAmountPaid;
      const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';

      batch.update(obligationRef, {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        lastPaymentDate: data.paymentDate,
        paidOffDate: newStatus === 'PAID' ? data.paymentDate : null,
        updatedAt: serverTimestamp(),
      });

      const entryRef = doc(collection(db, "accountingEntries"));
      batch.set(entryRef, {
        entryType: "CASH_OUT",
        entryDate: data.paymentDate,
        amount: data.amount,
        accountId: data.accountId,
        paymentMethod: data.paymentMethod,
        description: `จ่ายเจ้าหนี้: ${obligation.vendorShortNameSnapshot} (บิล: ${obligation.invoiceNo})`,
        notes: data.notes,
        vendorId: obligation.vendorId,
        vendorShortNameSnapshot: obligation.vendorShortNameSnapshot,
        vendorNameSnapshot: obligation.vendorNameSnapshot,
        sourceDocNo: obligation.invoiceNo,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast({ title: "บันทึกการจ่ายเจ้าหนี้สำเร็จ" });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>จ่ายเจ้าหนี้</DialogTitle>
          <DialogDescription>สำหรับบิลเลขที่: {obligation.invoiceNo} ({obligation.vendorShortNameSnapshot})</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="ap-payment-form" onSubmit={form.handleSubmit(handleSavePayment)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField name="paymentDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่จ่ายเงิน</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>)} />
              <FormField name="amount" control={form.control} render={({ field }) => (<FormItem><FormLabel>จำนวนเงินที่จ่าย</FormLabel><FormControl><Input type="number" {...field}/></FormControl><FormMessage/></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField name="paymentMethod" control={form.control} render={({ field }) => (
                  <FormItem>
                      <FormLabel>ช่องทาง</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                          <SelectContent>
                              <SelectItem value="CASH">เงินสด</SelectItem>
                              <SelectItem value="TRANSFER">โอน</SelectItem>
                          </SelectContent>
                      </Select>
                      <FormMessage/>
                  </FormItem>
              )} />
              <FormField name="accountId" control={form.control} render={({ field }) => (
                  <FormItem>
                      <FormLabel>บัญชี</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger></FormControl>
                          <SelectContent>
                              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                      <FormMessage/>
                  </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button type="submit" form="ap-payment-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}บันทึกการจ่าย</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const addCreditorSchema = z.object({
  vendorId: z.string().min(1, "กรุณาเลือก Vendor"),
  invoiceNo: z.string().min(1, "กรุณากรอกเลขที่บิล"),
  docDate: z.string().min(1, "กรุณาเลือกวันที่เอกสาร"),
  dueDate: z.string().optional(),
  amountTotal: z.coerce.number().positive("ยอดเงินต้องมากกว่า 0"),
  notes: z.string().optional(),
});

function AddCreditorDialog({ vendors, isOpen, onClose }: { vendors: WithId<Vendor>[]; isOpen: boolean; onClose: () => void; }) {
    const { db } = useFirebase();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [vendorSearch, setVendorSearch] = useState("");
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const form = useForm<z.infer<typeof addCreditorSchema>>({
        resolver: zodResolver(addCreditorSchema),
        defaultValues: {
            docDate: new Date().toISOString().split("T")[0],
            amountTotal: 0,
        },
    });

    const filteredVendors = useMemo(() => {
        if (!vendorSearch) return vendors;
        return vendors.filter(v => v.shortName.toLowerCase().includes(vendorSearch.toLowerCase()) || v.companyName.toLowerCase().includes(vendorSearch.toLowerCase()));
    }, [vendors, vendorSearch]);

    const handleSave = async (data: z.infer<typeof addCreditorSchema>) => {
        if (!db) return;
        setIsSubmitting(true);
        const selectedVendor = vendors.find(v => v.id === data.vendorId);
        if (!selectedVendor) {
            toast({ variant: 'destructive', title: 'ไม่พบ Vendor' });
            setIsSubmitting(false);
            return;
        }

        try {
            await addDoc(collection(db, 'accountingObligations'), {
                type: 'AP',
                status: 'UNPAID',
                vendorId: selectedVendor.id,
                vendorShortNameSnapshot: selectedVendor.shortName,
                vendorNameSnapshot: selectedVendor.companyName,
                invoiceNo: data.invoiceNo,
                sourceDocNo: data.invoiceNo,
                docDate: data.docDate,
                dueDate: data.dueDate || null,
                amountTotal: data.amountTotal,
                amountPaid: 0,
                balance: data.amountTotal,
                notes: data.notes || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'บันทึกเจ้าหนี้สำเร็จ' });
            onClose();
            form.reset();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>เพิ่มเจ้าหนี้ใหม่</DialogTitle>
                    <DialogDescription>บันทึกบิลที่ได้รับจากร้านค้าภายนอก</DialogDescription>
                </DialogHeader>
                 <Form {...form}>
                    <form id="add-creditor-form" onSubmit={form.handleSubmit(handleSave)} className="space-y-4 py-4">
                        <FormField name="vendorId" control={form.control} render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Vendor</FormLabel>
                                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}><PopoverTrigger asChild>
                                <FormControl><Button variant="outline" role="combobox" className="justify-between">
                                    {field.value ? vendors.find(v => v.id === field.value)?.shortName : "เลือก Vendor..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button></FormControl>
                                </PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command>
                                <CommandInput placeholder="ค้นหา..." value={vendorSearch} onValueChange={setVendorSearch} />
                                <CommandList><CommandEmpty>ไม่พบ Vendor</CommandEmpty><CommandGroup>
                                    {filteredVendors.map((v) => (
                                    <CommandItem value={v.shortName} key={v.id} onSelect={() => { field.onChange(v.id); setIsPopoverOpen(false); }}>
                                        {v.shortName} - {v.companyName}
                                    </CommandItem>
                                    ))}
                                </CommandGroup></CommandList>
                                </Command></PopoverContent></Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField name="invoiceNo" control={form.control} render={({ field }) => (<FormItem><FormLabel>เลขที่บิล (Invoice No.)</FormLabel><FormControl><Input {...field}/></FormControl><FormMessage/></FormItem>)} />
                        <FormField name="amountTotal" control={form.control} render={({ field }) => (<FormItem><FormLabel>ยอดเงินรวม</FormLabel><FormControl><Input type="number" {...field}/></FormControl><FormMessage/></FormItem>)} />
                        <div className="grid grid-cols-2 gap-4">
                            <FormField name="docDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่บนบิล</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>)} />
                            <FormField name="dueDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันครบกำหนดจ่าย</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>)} />
                        </div>
                        <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
                    </form>
                 </Form>
                 <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
                    <Button type="submit" form="add-creditor-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}บันทึก</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ObligationList({ type, searchTerm, accounts, vendors }: { type: 'AR' | 'AP', searchTerm: string, accounts: WithId<AccountingAccount>[], vendors: WithId<Vendor>[] }) {
    const { db } = useFirebase();
    const { toast } = useToast();
    const router = useRouter();
    
    const [obligations, setObligations] = useState<WithId<AccountingObligation>[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<FirestoreError | null>(null);

    const [docStatuses, setDocStatuses] = useState<Record<string, string>>({});

    const [payingAR, setPayingAR] = useState<WithId<AccountingObligation> | null>(null);
    const [payingAP, setPayingAP] = useState<WithId<AccountingObligation> | null>(null);
    
    const obligationsQuery = useMemo(() => {
        if (!db) return null;
        return query(
            collection(db, "accountingObligations"),
            where("type", "==", type),
            limit(500)
        );
    }, [db, type]);

    useEffect(() => {
        if (!obligationsQuery) return;
        
        setLoading(true);
        setError(null);

        const unsubscribe = onSnapshot(obligationsQuery, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingObligation>));
            let filtered = data.filter(ob => ob.status === 'UNPAID' || ob.status === 'PARTIAL');

            filtered.sort((a, b) => {
                const da = a.dueDate ? parseISO(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                const db = b.dueDate ? parseISO(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                return da - db;
            });

            setObligations(filtered);
            setLoading(false);
        }, (err: FirestoreError) => {
            console.error(`Error loading ${type} obligations:`, err);
            setError(err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [obligationsQuery, type]);

    useEffect(() => {
        if (type !== 'AR' || obligations.length === 0 || !db) return;

        const arSourceDocIds = Array.from(new Set(obligations.map(ob => ob.sourceDocId).filter(Boolean)));
        
        const unsubscribes = arSourceDocIds.map(docId => {
            return onSnapshot(doc(db, 'documents', docId!), (docSnap) => {
                if (docSnap.exists()) {
                    setDocStatuses(prev => ({
                        ...prev,
                        [docId!]: docSnap.data().receiptStatus || 'NONE'
                    }));
                }
            });
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, [obligations, type, db]);

    const filteredObligations = useMemo(() => {
        if (!searchTerm) return obligations;
        const lowerSearch = searchTerm.toLowerCase();
        return obligations.filter(ob =>
            ob.customerNameSnapshot?.toLowerCase().includes(lowerSearch) ||
            ob.vendorShortNameSnapshot?.toLowerCase().includes(lowerSearch) ||
            ob.vendorNameSnapshot?.toLowerCase().includes(lowerSearch) ||
            ob.sourceDocNo.toLowerCase().includes(lowerSearch) ||
            ob.invoiceNo?.toLowerCase().includes(lowerSearch)
        );
    }, [obligations, searchTerm]);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }
    if (error) {
        return <div className="text-center p-8 text-destructive"><AlertCircle className="mx-auto mb-2" />{error.message}</div>;
    }

    const renderTable = () => (
      <Table>
          <TableHeader>
              <TableRow>
                  <TableHead>Due Date</TableHead>
                  <TableHead>{type === 'AR' ? 'Doc No.' : 'Invoice No.'}</TableHead>
                  <TableHead>{type === 'AR' ? 'Customer' : 'Vendor'}</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Action</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {filteredObligations.length > 0 ? filteredObligations.map(ob => {
                  const receiptStatus = docStatuses[ob.sourceDocId || ''];
                  const isReceiptIssued = receiptStatus === 'ISSUED_NOT_CONFIRMED' || receiptStatus === 'CONFIRMED';
                  
                  return (
                    <TableRow key={ob.id}>
                        <TableCell>{ob.dueDate ? safeFormat(parseISO(ob.dueDate), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell>{type === 'AR' ? ob.sourceDocNo : (ob.invoiceNo || ob.sourceDocNo)}</TableCell>
                        <TableCell>{type === 'AR' ? ob.customerNameSnapshot : (ob.vendorShortNameSnapshot || ob.vendorNameSnapshot)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ob.amountTotal)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ob.amountPaid)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(ob.balance)}</TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                {type === 'AR' && ob.sourceDocType === 'TAX_INVOICE' && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Button 
                                                        size="sm" 
                                                        variant={isReceiptIssued ? "secondary" : "default"} 
                                                        disabled={isReceiptIssued}
                                                        onClick={() => router.push(`/app/management/accounting/documents/receipt?customerId=${ob.customerId}&sourceDocId=${ob.sourceDocId}`)}
                                                    >
                                                        <Receipt className="mr-2 h-4 w-4" />
                                                        ออกใบเสร็จ
                                                    </Button>
                                                </span>
                                            </TooltipTrigger>
                                            {isReceiptIssued && <TooltipContent>ออกใบเสร็จไปแล้ว ({receiptStatus})</TooltipContent>}
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {type === 'AR' ? (
                                    <Button size="sm" variant="outline" onClick={() => setPayingAR(ob)}>
                                        <HandCoins className="mr-2 h-4 w-4" /> รับชำระ
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => setPayingAP(ob)}>
                                        <HandCoins className="mr-2 h-4 w-4" /> จ่ายบิล
                                    </Button>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                  );
              }) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center">{type === 'AR' ? 'ไม่พบรายการลูกหนี้คงค้าง' : 'ไม่พบรายการเจ้าหนี้คงค้าง'}</TableCell></TableRow>
              )}
          </TableBody>
      </Table>
    );

    return (
        <>
            {renderTable()}
            {payingAR && (
                <ReceivePaymentDialog isOpen={!!payingAR} onClose={() => setPayingAR(null)} obligation={payingAR} accounts={accounts} />
            )}
            {payingAP && (
                <PayCreditorDialog isOpen={!!payingAP} onClose={() => setPayingAP(null)} obligation={payingAP} accounts={accounts} />
            )}
        </>
    );
}

function ReceivablesPayablesContent({ profile }: { profile: UserProfile }) {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') === 'creditors' ? 'creditors' : 'debtors';
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [searchTerm, setSearchTerm] = useState("");
    const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
    const [vendors, setVendors] = useState<WithId<Vendor>[]>([]);
    const [isAddingCreditor, setIsAddingCreditor] = useState(false);
    const { db } = useFirebase();

    useEffect(() => {
        if (!db) return;
        const accountsQ = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        const unsubAccounts = onSnapshot(accountsQ, (snap) => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>)));
        });
        
        const vendorsQ = query(collection(db, "vendors"), where("isActive", "==", true));
        const unsubVendors = onSnapshot(vendorsQ, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Vendor>));
            data.sort((a, b) => String(a.shortName || "").localeCompare(String(b.shortName || ""), 'th'));
            setVendors(data);
        });

        return () => { unsubAccounts(); unsubVendors(); };
    }, [db]);


    return (
        <>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <TabsList>
                    <TabsTrigger value="debtors">ลูกหนี้ (Debtors)</TabsTrigger>
                    <TabsTrigger value="creditors">เจ้าหนี้ (Creditors)</TabsTrigger>
                </TabsList>
                <div className="flex w-full md:w-auto items-center gap-2">
                    {activeTab === 'creditors' && (
                        <Button onClick={() => setIsAddingCreditor(true)}><PlusCircle/> เพิ่มเจ้าหนี้</Button>
                    )}
                    <div className="w-full max-w-sm relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="ค้นหาจากชื่อ, เลขที่เอกสาร..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                <TabsContent value="debtors" className="mt-0">
                    <ObligationList type="AR" searchTerm={searchTerm} accounts={accounts} vendors={vendors} />
                </TabsContent>
                <TabsContent value="creditors" className="mt-0">
                    <ObligationList type="AP" searchTerm={searchTerm} accounts={accounts} vendors={vendors} />
                </TabsContent>
              </CardContent>
            </Card>
        </Tabs>
        <AddCreditorDialog vendors={vendors} isOpen={isAddingCreditor} onClose={() => setIsAddingCreditor(false)} />
        </>
    );
}

export default function ReceivablesPayablesPage() {
    const { profile, loading } = useAuth();
    const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    if (!profile || !hasPermission) {
        return (
            <div className="w-full">
                <PageHeader title="ลูกหนี้/เจ้าหนี้" />
                <Card className="text-center py-12">
                    <CardHeader>
                        <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                        <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
            <PageHeader title="ลูกหนี้/เจ้าหนี้" description="จัดการและติดตามข้อมูลลูกหนี้และเจ้าหนี้" />
            <ReceivablesPayablesContent profile={profile} />
        </Suspense>
    );
}
