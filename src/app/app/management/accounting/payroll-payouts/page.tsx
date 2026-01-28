
"use client";

import { useState, useMemo, useEffect } from "react";
import {
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  serverTimestamp,
  collection,
  runTransaction,
  increment,
  type FirestoreError,
} from "firebase/firestore";
import { format } from "date-fns";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { WithId } from "@/firebase/firestore/use-collection";
import type { Payslip, AccountingAccount } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, HandCoins, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Helper Functions & Schemas ---
const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const paymentSchema = z.object({
  paidDate: z.string().min(1, "กรุณาเลือกวันที่จ่ายเงิน"),
  paymentMethod: z.enum(["CASH", "TRANSFER"], { required_error: "กรุณาเลือกช่องทาง" }),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  referenceNo: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

// --- Payment Dialog Component ---
function PayDialog({
  payslip,
  accounts,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  payslip: WithId<Payslip>;
  accounts: WithId<AccountingAccount>[];
  onClose: () => void;
  onConfirm: (data: PaymentFormData) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paidDate: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: "TRANSFER",
      accountId: accounts.find(a => a.type === 'BANK')?.id || accounts[0]?.id || "",
      referenceNo: "",
    },
  });

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>บันทึกการจ่ายเงินเดือน</DialogTitle>
          <DialogDescription>
            พนักงาน: {payslip.userName} | งวด: {payslip.payrollBatchId}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="payment-form" onSubmit={form.handleSubmit(onConfirm)} className="space-y-4 py-4">
            <div className="p-4 border rounded-md font-bold text-center text-xl">
              ยอดจ่ายสุทธิ: {formatCurrency(payslip.snapshot?.netPay ?? 0)} บาท
            </div>
            <FormField control={form.control} name="paidDate" render={({ field }) => (<FormItem><FormLabel>วันที่จ่ายเงิน</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accountId" render={({ field }) => (<FormItem><FormLabel>จากบัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="referenceNo" render={({ field }) => (<FormItem><FormLabel>เลขที่อ้างอิง (ถ้ามี)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
          <Button type="submit" form="payment-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 animate-spin"/>}
            ยืนยันการจ่ายเงิน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// --- Main Page Component ---
export default function PayrollPayoutsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [payslips, setPayslips] = useState<WithId<Payslip>[]>([]);
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  const [payingPayslip, setPayingPayslip] = useState<WithId<Payslip> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  useEffect(() => {
    if (!db || !hasPermission) {
        setLoading(false);
        return;
    };
    
    setLoading(true);

    const payslipsQuery = query(
      collectionGroup(db, "payslips"),
      where("status", "==", "READY_TO_PAY")
    );
    
    const accountsQuery = query(
        collection(db, "accountingAccounts"),
        where("isActive", "==", true),
        orderBy("name")
    );

    const unsubPayslips = onSnapshot(payslipsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, ref: doc.ref } as WithId<Payslip> & { ref: any }));
      setPayslips(data);
      setLoading(false);
    }, (err) => {
      setError(err);
      setLoading(false);
      toast({ variant: 'destructive', title: 'ไม่สามารถโหลดสลิปเงินเดือน', description: err.message });
    });

    const unsubAccounts = onSnapshot(accountsQuery, (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<AccountingAccount>)))
    }, (err) => {
        toast({ variant: 'destructive', title: 'ไม่สามารถโหลดบัญชี', description: err.message });
    });
    
    return () => {
        unsubPayslips();
        unsubAccounts();
    }

  }, [db, hasPermission, toast]);

  const handleConfirmPayment = async (formData: PaymentFormData) => {
    if (!db || !profile || !payingPayslip) return;
    setIsSubmitting(true);

    try {
        const payslipRef = payingPayslip.ref;
        const payrollBatchRef = payslipRef.parent.parent; // This should be the payrollBatch doc

        if (!payrollBatchRef) {
            throw new Error("Could not find parent payroll batch.");
        }

        await runTransaction(db, async (transaction) => {
            const entryRef = doc(collection(db, 'accountingEntries'));
            
            // 1. Create accounting entry
            transaction.set(entryRef, {
                entryType: 'CASH_OUT',
                entryDate: formData.paidDate,
                amount: payingPayslip.snapshot?.netPay ?? 0,
                accountId: formData.accountId,
                paymentMethod: formData.paymentMethod,
                description: `จ่ายเงินเดือน: ${payingPayslip.userName} งวด ${payingPayslip.payrollBatchId}`,
                sourceDocType: 'PAYSLIP',
                sourceDocId: payingPayslip.id,
                sourceDocNo: `PAYSLIP-${payingPayslip.payrollBatchId}-${payingPayslip.userId.slice(0, 5)}`,
                categoryMain: 'ค่าแรง/เงินเดือน',
                categorySub: 'เงินเดือน',
                referenceNo: formData.referenceNo,
                createdAt: serverTimestamp(),
            });

            // 2. Update payslip
            transaction.update(payslipRef, {
                status: 'PAID',
                paidAt: serverTimestamp(),
                paidByUid: profile.uid,
                paidByName: profile.displayName,
                paymentMethod: formData.paymentMethod,
                paidAccountId: formData.accountId,
                accountingEntryId: entryRef.id,
            });

            // 3. Update payroll batch summary
            transaction.update(payrollBatchRef, {
                'statusSummary.readyCount': increment(-1),
                'statusSummary.paidCount': increment(1),
            });
        });

        toast({ title: 'บันทึกการจ่ายเงินเดือนสำเร็จ' });
        setPayingPayslip(null); // Close dialog

    } catch (e: any) {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (!hasPermission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
          <CardDescription>สำหรับฝ่ายบริหาร/บัญชีเท่านั้น</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="จ่ายเงินเดือน" description="ตรวจสอบและยืนยันการจ่ายเงินเดือนที่พนักงานอนุมัติแล้ว" />
      <Card>
        <CardHeader>
            <CardTitle>รายการที่พร้อมจ่าย</CardTitle>
            <CardDescription>แสดงสลิปเงินเดือนที่พนักงานยืนยันแล้ว และพร้อมสำหรับฝ่ายบัญชีดำเนินการจ่ายเงิน</CardDescription>
        </CardHeader>
        <CardContent>
            {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>
            ) : error ? (
                <div className="text-destructive text-center"><AlertCircle className="mx-auto" /> {error.message}</div>
            ) : payslips.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">ไม่มีรายการที่พร้อมจ่ายในขณะนี้</div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>พนักงาน</TableHead>
                            <TableHead>งวด</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead className="text-right">ยอดสุทธิ</TableHead>
                            <TableHead className="text-right">จัดการ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payslips.map(p => (
                            <TableRow key={p.id}>
                                <TableCell>{p.userName}</TableCell>
                                <TableCell>{p.payrollBatchId}</TableCell>
                                <TableCell><Badge variant="outline">พร้อมจ่าย</Badge></TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(p.snapshot?.netPay ?? 0)}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => setPayingPayslip(p)}>
                                        <HandCoins className="mr-2"/> บันทึกการจ่าย
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </CardContent>
      </Card>
      
      {payingPayslip && (
        <PayDialog
            payslip={payingPayslip}
            accounts={accounts}
            onClose={() => setPayingPayslip(null)}
            onConfirm={handleConfirmPayment}
            isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
