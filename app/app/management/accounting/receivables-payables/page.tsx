"use client";

import { useMemo, Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp, getDoc, orderBy } from 'firebase/firestore';
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
import { Loader2, Search, AlertCircle, HandCoins } from 'lucide-react';

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
        updatedAt: serverTimestamp(),
      });
      
      // 2. Create Accounting Entry
      const entryRef = doc(collection(db, "accountingEntries"));
      batch.set(entryRef, {
          entryType: "CASH_IN", // Using CASH_IN as it's a direct cash/bank transaction
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
      if (newStatus === 'PAID') {
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

function ReceivablesPayablesContent() {
  const { db } = useFirebase();
  const { profile } = useAuth() as { profile: UserProfile };
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'creditors' ? 'creditors' : 'debtors';
  
  const [obligations, setObligations] = useState<WithId<AccountingObligation>[]>([]);
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [payingObligation, setPayingObligation] = useState<WithId<AccountingObligation> | null>(null);

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    const q = query(
      collection(db, "accountingObligations"),
      where("type", "==", "AR"),
      where("status", "in", ["UNPAID", "PARTIAL"]),
      orderBy("dueDate", "asc")
    );
    const unsubObligations = onSnapshot(q, (snap) => {
        setObligations(snap.docs.map(d => ({id: d.id, ...d.data()}) as WithId<AccountingObligation>));
        setLoading(false);
    }, (err) => {
        setError(err);
        setLoading(false);
    });

    const accountsQ = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    const unsubAccounts = onSnapshot(accountsQ, (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WithId<AccountingAccount>));
    });

    return () => { unsubObligations(); unsubAccounts(); };
  }, [db]);
  
  const filteredObligations = useMemo(() => {
    if (!searchTerm) return obligations;
    const lowerSearch = searchTerm.toLowerCase();
    return obligations.filter(ob => 
        ob.customerNameSnapshot.toLowerCase().includes(lowerSearch) ||
        ob.sourceDocNo.toLowerCase().includes(lowerSearch)
    );
  }, [obligations, searchTerm]);

  const renderDebtors = () => {
    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="text-center p-8 text-destructive"><AlertCircle className="mx-auto mb-2"/>{error.message}</div>;

    return (
        <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>ลูกหนี้คงค้าง (AR)</CardTitle>
                  <CardDescription>รายการที่ยังเก็บเงินไม่ได้ หรือเก็บได้ไม่ครบ</CardDescription>
                </div>
                <div className="w-full max-w-sm relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="ค้นหาจากชื่อลูกค้า, เลขที่เอกสาร..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Doc No.</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredObligations.length > 0 ? filteredObligations.map(ob => (
                            <TableRow key={ob.id}>
                                <TableCell>{ob.customerNameSnapshot}</TableCell>
                                <TableCell>{ob.sourceDocNo}</TableCell>
                                <TableCell>{ob.dueDate ? safeFormat(parseISO(ob.dueDate), 'dd/MM/yy') : '-'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(ob.amountTotal)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(ob.amountPaid)}</TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(ob.balance)}</TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="outline" onClick={() => setPayingObligation(ob)}>
                                    <HandCoins className="mr-2 h-4 w-4" /> รับชำระ
                                  </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={7} className="h-24 text-center">ไม่พบรายการลูกหนี้คงค้าง</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
  };
  
  return (
    <>
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="debtors">ลูกหนี้ (Debtors)</TabsTrigger>
          <TabsTrigger value="creditors">เจ้าหนี้ (Creditors)</TabsTrigger>
        </TabsList>
        <TabsContent value="debtors">
          {renderDebtors()}
        </TabsContent>
        <TabsContent value="creditors">
          <Card>
            <CardHeader>
              <CardTitle>เจ้าหนี้การค้า</CardTitle>
              <CardDescription>
                ภาพรวมและจัดการเจ้าหนี้ทั้งหมดในระบบ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Coming Soon: Creditor management features will be implemented here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {payingObligation && (
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


export default function ReceivablesPayablesPage() {
  const { profile } = useAuth();
  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

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
                <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น</CardDescription>
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
