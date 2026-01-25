"use client";

import { useMemo, Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp, getDoc, orderBy, type FirestoreError } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO } from 'date-fns';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, AlertCircle, HandCoins, ExternalLink } from 'lucide-react';

import type { WithId } from '@/firebase/firestore/use-collection';
import type { AccountingObligation, AccountingAccount, UserProfile } from '@/lib/types';
import { safeFormat } from '@/lib/date-utils';

const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const paymentSchema = z.object({
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
  profile,
}: {
  obligation: WithId<AccountingObligation>;
  accounts: WithId<AccountingAccount>[];
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
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
  const cashReceived = watchedAmount - watchedWhtAmount;

  const handleSavePayment = async (data: z.infer<typeof paymentSchema>) => {
    if (!db) return;
    setIsSubmitting(true);

    try {
      const batch = writeBatch(db);

      // 1. Update Obligation
      const obligationRef = doc(db, 'accountingObligations', obligation.id);
      const newAmountPaid = obligation.amountPaid + data.amount;
      const newBalance = obligation.amountTotal - newAmountPaid;
      const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
      
      batch.update(obligationRef, {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        lastPaymentDate: data.paymentDate,
        paidOffDate: newStatus === 'PAID' ? data.paymentDate : null,
        updatedAt: serverTimestamp(),
      });
      
      // 2. Create Accounting Entry
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

      // 3. Update Source Document if fully paid
      if (newStatus === 'PAID' && obligation.sourceDocId) {
        const sourceDocRef = doc(db, 'documents', obligation.sourceDocId);
        batch.update(sourceDocRef, {
          status: 'PAID',
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          receivedAccountId: data.accountId,
          cashReceived: cashReceived,
          withholdingEnabled: data.withholdingEnabled,
          withholdingAmount: data.withholdingAmount,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      toast({ title: "บันทึกการรับชำระสำเร็จ" });
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
              <FormField name="paymentMethod" control={form.control} render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage/></FormItem>)} />
              <FormField name="accountId" control={form.control} render={({ field }) => (<FormItem><FormLabel>บัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)} />
            </div>
            <div className="p-4 border rounded-md space-y-4">
              <FormField control={form.control} name="withholdingEnabled" render={({ field }) => (<FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">มีหัก ณ ที่จ่าย</FormLabel></FormItem>)} />
              {watchedWhtEnabled && <FormField control={form.control} name="withholdingAmount" render={({ field }) => (<FormItem><FormLabel>ยอดเงินที่ถูกหัก (WHT)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>)} />}
            </div>
            <div className="text-right space-y-1">
                <p>ยอดรับชำระ: {formatCurrency(watchedAmount)}</p>
                {watchedWhtEnabled && <p className='text-destructive'>หัก ณ ที่จ่าย: -{formatCurrency(watchedWhtAmount)}</p>}
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

function ObligationList({ type, searchTerm }: { type: 'AR' | 'AP', searchTerm: string }) {
    const { db } = useFirebase();
    const { toast } = useToast();
    const { profile } = useAuth() as { profile: UserProfile };

    const [obligations, setObligations] = useState<WithId<AccountingObligation>[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<FirestoreError | null>(null);
    const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);

    const [payingObligation, setPayingObligation] = useState<WithId<AccountingObligation> | null>(null);
    const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);

    useEffect(() => {
        if (!db) return;
        const accountsQ = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        const unsubAccounts = onSnapshot(accountsQ, (snap) => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>)));
        }, (err) => {
            console.error("Error loading accounts:", err);
            toast({ variant: 'destructive', title: "Could not load accounts", description: "ไม่มีสิทธิ์เข้าถึงข้อมูลบัญชี หรือการดึงข้อมูลถูกปฏิเสธ" });
        });
        return () => unsubAccounts();
    }, [db, toast]);

    useEffect(() => {
        if (!db) return;
        setLoading(true);
        setError(null);
        setIndexCreationUrl(null);

        const q = query(
            collection(db, "accountingObligations"),
            where("type", "==", type),
            where("status", "in", ["UNPAID", "PARTIAL"]),
            orderBy("dueDate", "asc")
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingObligation>));
            data.sort((a, b) => {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
            });
            setObligations(data);
            setLoading(false);
            setError(null);
        }, (err: FirestoreError) => {
            console.error(`Error loading ${type} obligations:`, err);
            setError(err);
            if (err.message?.includes('requires an index')) {
                const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
                if (urlMatch) setIndexCreationUrl(urlMatch[0]);
            }
            setLoading(false);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: "ไม่มีสิทธิ์เข้าถึงข้อมูลลูกหนี้/เจ้าหนี้ หรือการดึงข้อมูลถูกปฏิเสธ" });
        });

        return () => unsubscribe();
    }, [db, type, toast, retry]);

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
    if (indexCreationUrl) {
         return (
            <div className="text-center p-8 bg-muted/50 rounded-lg">
                <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                <h3 className="mt-4 font-semibold text-lg">Index Required</h3>
                <p className="mt-2 text-sm text-muted-foreground">The database needs a special index to perform this query. Please click the link below to create it, then wait a few minutes and refresh the page.</p>
                <Button asChild className="mt-4">
                    <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" /> Create Index
                    </a>
                </Button>
                <Button variant="outline" className="mt-4 ml-2" onClick={() => setRetry(r => r + 1)}>Retry</Button>
            </div>
        );
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
              {filteredObligations.length > 0 ? filteredObligations.map(ob => (
                  <TableRow key={ob.id}>
                      <TableCell>{ob.dueDate ? safeFormat(parseISO(ob.dueDate), 'dd/MM/yy') : '-'}</TableCell>
                      <TableCell>{type === 'AR' ? ob.sourceDocNo : (ob.invoiceNo || ob.sourceDocNo)}</TableCell>
                      <TableCell>{type === 'AR' ? ob.customerNameSnapshot : (ob.vendorShortNameSnapshot || ob.vendorNameSnapshot)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ob.amountTotal)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ob.amountPaid)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(ob.balance)}</TableCell>
                      <TableCell className="text-right">
                          {type === 'AR' ? (
                            <Button size="sm" variant="outline" onClick={() => setPayingObligation(ob)}>
                                <HandCoins className="mr-2 h-4 w-4" /> รับชำระ
                            </Button>
                          ) : (
                             <Button size="sm" variant="outline" disabled>
                                Pay Bill
                            </Button>
                          )}
                      </TableCell>
                  </TableRow>
              )) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center">{type === 'AR' ? 'ไม่พบรายการลูกหนี้คงค้าง' : 'ไม่พบรายการเจ้าหนี้คงค้าง'}</TableCell></TableRow>
              )}
          </TableBody>
      </Table>
    );

    return (
        <>
            {renderTable()}
            {payingObligation && type === 'AR' && (
                <ReceivePaymentDialog
                    isOpen={!!payingObligation}
                    onClose={() => setPayingObligation(null)}
                    obligation={payingObligation}
                    accounts={accounts}
                    profile={profile}
                />
            )}
        </>
    );
}

function ReceivablesPayablesContent() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') === 'creditors' ? 'creditors' : 'debtors';
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [searchTerm, setSearchTerm] = useState("");

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <TabsList>
                    <TabsTrigger value="debtors">ลูกหนี้ (Debtors)</TabsTrigger>
                    <TabsTrigger value="creditors">เจ้าหนี้ (Creditors)</TabsTrigger>
                </TabsList>
                 <div className="w-full max-w-sm relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="ค้นหาจากชื่อ, เลขที่เอกสาร..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                <TabsContent value="debtors" className="mt-0">
                    <ObligationList type="AR" searchTerm={searchTerm} />
                </TabsContent>
                <TabsContent value="creditors" className="mt-0">
                    <ObligationList type="AP" searchTerm={searchTerm} />
                </TabsContent>
              </CardContent>
            </Card>
        </Tabs>
    );
}

export default function ReceivablesPayablesPage() {
    const { profile } = useAuth();
    const hasPermission = useMemo(() => {
        if (!profile) return false;
        return profile.role === 'ADMIN' || ['MANAGEMENT', 'FINANCE', 'ACCOUNTING'].includes(profile.department || '');
    }, [profile]);

    if (!profile) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    if (!hasPermission) {
        return (
            <div className="w-full">
                <PageHeader title="ลูกหนี้/เจ้าหนี้" />
                <Card className="text-center py-12">
                    <CardHeader>
                        <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                        <CardDescription>หน้านี้สงวนไว้สำหรับฝ่ายการเงิน/บริหาร/ผู้ดูแลเท่านั้น</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <>
            <PageHeader title="ลูกหนี้/เจ้าหนี้" description="จัดการและติดตามข้อมูลลูกหนี้และเจ้าหนี้" />
            <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
                <ReceivablesPayablesContent />
            </Suspense>
        </>
    );
}