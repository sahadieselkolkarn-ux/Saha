
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, onSnapshot, orderBy, where, doc, writeBatch, serverTimestamp, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, MoreHorizontal, CheckCircle, XCircle } from "lucide-react";
import { WithId } from "@/firebase/firestore/use-collection";
import { PaymentClaim, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const approvalSchema = z.object({
  receivedDate: z.string().min(1, "กรุณาเลือกวันที่รับเงิน"),
  paymentMethod: z.enum(["CASH", "TRANSFER"], { required_error: "กรุณาเลือกช่องทาง" }),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  withholdingEnabled: z.boolean().default(false),
  withholdingAmount: z.coerce.number().min(0).optional(),
  note: z.string().optional(),
});

function ApproveClaimDialog({ claim, accounts, onClose, onConfirm }: { claim: WithId<PaymentClaim>, accounts: WithId<AccountingAccount>[], onClose: () => void, onConfirm: (data: any) => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<z.infer<typeof approvalSchema>>({
    resolver: zodResolver(approvalSchema),
    defaultValues: {
      receivedDate: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: claim.suggestedPaymentMethod === "CASH" || claim.suggestedPaymentMethod === "TRANSFER" ? claim.suggestedPaymentMethod : undefined,
      accountId: claim.suggestedAccountId,
      withholdingEnabled: false,
      withholdingAmount: 0,
      note: "",
    },
  });

  const isWhtEnabled = form.watch("withholdingEnabled");
  const whtAmount = form.watch("withholdingAmount") || 0;
  const cashReceived = claim.amountDue - whtAmount;
  
  const handleSubmit = async (data: z.infer<typeof approvalSchema>) => {
    setIsLoading(true);
    await onConfirm({ ...data, cashReceived });
    setIsLoading(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยันการรับเงิน</DialogTitle>
          <DialogDescription>สำหรับเอกสารเลขที่: {claim.sourceDocNo}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="approve-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="receivedDate" render={({ field }) => (<FormItem><FormLabel>วันที่รับเงิน</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accountId" render={({ field }) => (<FormItem><FormLabel>บัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="p-4 border rounded-md space-y-4">
              <FormField control={form.control} name="withholdingEnabled" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">มีหัก ณ ที่จ่าย 3%</FormLabel></FormItem>
              )} />
              {isWhtEnabled && <FormField control={form.control} name="withholdingAmount" render={({ field }) => (<FormItem><FormLabel>ยอดเงินที่ถูกหัก (WHT)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />}
            </div>
            <div className="space-y-2">
                <div className="flex justify-between font-medium"><p>ยอดตามบิล:</p><p>{formatCurrency(claim.amountDue)}</p></div>
                {isWhtEnabled && <div className="flex justify-between text-destructive"><p>หัก ณ ที่จ่าย:</p><p>-{formatCurrency(whtAmount)}</p></div>}
                <div className="flex justify-between font-bold text-lg border-t pt-2"><p>ยอดเงินเข้าจริง:</p><p>{formatCurrency(cashReceived)}</p></div>
            </div>
            <FormField control={form.control} name="note" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>ยกเลิก</Button>
          <Button type="submit" form="approve-form" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 animate-spin" />}ยืนยัน</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectClaimDialog({ claim, onClose, onConfirm }: { claim: WithId<PaymentClaim>, onClose: () => void, onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = async () => {
    if (!reason) {
      alert("กรุณากรอกเหตุผล");
      return;
    }
    setIsLoading(true);
    await onConfirm(reason);
    setIsLoading(false);
  };
  
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ตีกลับรายการ</DialogTitle>
          <DialogDescription>สำหรับเอกสารเลขที่: {claim.sourceDocNo}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea placeholder="กรุณาระบุเหตุผลในการตีกลับ..." value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>ยกเลิก</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isLoading || !reason}>{isLoading && <Loader2 className="mr-2 animate-spin" />}ตีกลับ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingInboxPage() {
  const { profile } = useAuth();
  const { db } = useFirebase();
  const { toast } = useToast();
  
  const [claims, setClaims] = useState<WithId<PaymentClaim>[]>([]);
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<ClaimStatus>("PENDING");

  const [approvingClaim, setApprovingClaim] = useState<WithId<PaymentClaim> | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<WithId<PaymentClaim> | null>(null);
  const syncAttempted = useRef(false);

  const hasPermission = useMemo(() => profile?.role === "ADMIN" || profile?.department === "MANAGEMENT", [profile]);

  useEffect(() => {
    if (!db) return;
    const claimsQuery = query(collection(db, "paymentClaims"), orderBy("createdAt", "desc"));
    const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    
    const unsubClaims = onSnapshot(claimsQuery, (snap) => {
        setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<PaymentClaim>)));
        setLoading(false);
    }, () => setLoading(false));

    const unsubAccounts = onSnapshot(accountsQuery, (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>)));
    });

    return () => { unsubClaims(); unsubAccounts(); };
  }, [db]);

  useEffect(() => {
    if (activeTab === 'APPROVED' && !syncAttempted.current && !loading && claims.length > 0) {
      syncAttempted.current = true;

      const syncOldClaims = async () => {
        if (!db) return;
        const claimsToSync = claims.filter(c => c.status === 'APPROVED' && !c.docSyncedAt);
        if (claimsToSync.length === 0) return;

        toast({ title: "กำลังซิงค์สถานะเอกสารย้อนหลัง...", description: `พบ ${claimsToSync.length} รายการ` });

        let successCount = 0;
        let errorCount = 0;

        for (const claim of claimsToSync) {
          try {
            const docRef = doc(db, 'documents', claim.sourceDocId);
            const docSnap = await getDoc(docRef);

            const batch = writeBatch(db);
            let needsCommit = false;

            if (docSnap.exists()) {
              const docData = docSnap.data();
              if (docData.status !== 'PAID' && docData.status !== 'CANCELLED') {
                batch.update(docRef, {
                  status: 'PAID',
                  paymentDate: claim.receivedDate || format(claim.approvedAt?.toDate() || new Date(), 'yyyy-MM-dd'),
                  paymentMethod: claim.paymentMethod || claim.suggestedPaymentMethod || 'CASH',
                  receivedAccountId: claim.accountId,
                  updatedAt: serverTimestamp(),
                });
                needsCommit = true;
              }
            }
            
            const claimRef = doc(db, "paymentClaims", claim.id);
            batch.update(claimRef, { docSyncedAt: serverTimestamp() });
            needsCommit = true;

            if (needsCommit) {
                await batch.commit();
            }
            successCount++;
          } catch (e) {
            console.error(`Failed to sync claim ${claim.id}:`, e);
            errorCount++;
          }
        }

        if (successCount > 0 || errorCount > 0) {
          toast({
            title: "การซิงค์เสร็จสิ้น",
            description: `อัปเดตสำเร็จ ${successCount} รายการ${errorCount > 0 ? `, ล้มเหลว ${errorCount} รายการ` : ''}`,
          });
        }
      };

      syncOldClaims();
    }
  }, [activeTab, claims, loading, db, toast]);

  const filteredClaims = useMemo(() => {
    let filtered = claims.filter(c => c.status === activeTab);
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(c => 
            c.sourceDocNo.toLowerCase().includes(lowerSearch) ||
            c.customerNameSnapshot?.toLowerCase().includes(lowerSearch) ||
            c.note?.toLowerCase().includes(lowerSearch)
        );
    }
    return filtered;
  }, [claims, activeTab, searchTerm]);

  const handleApproveConfirm = async (data: any) => {
    if (!db || !profile || !approvingClaim) return;

    const { receivedDate, paymentMethod, accountId, withholdingEnabled, withholdingAmount, note, cashReceived } = data;

    try {
        const sourceDocRef = doc(db, "documents", approvingClaim.sourceDocId);
        const sourceDocSnap = await getDoc(sourceDocRef);

        if (!sourceDocSnap.exists()) {
            throw new Error("ไม่พบเอกสารอ้างอิง");
        }
        if (sourceDocSnap.data().status === 'CANCELLED') {
            toast({
                variant: 'destructive',
                title: 'ไม่สามารถยืนยันได้',
                description: 'เอกสารถูกยกเลิกไปแล้ว ไม่สามารถยืนยันรับเงินได้',
            });
            return;
        }

        const batch = writeBatch(db);
        const claimRef = doc(db, "paymentClaims", approvingClaim.id);
        
        // 1. Update Payment Claim
        batch.update(claimRef, {
            status: "APPROVED",
            approvedAt: serverTimestamp(),
            approvedByUid: profile.uid,
            approvedByName: profile.displayName,
            receivedDate,
            paymentMethod,
            accountId,
            withholdingEnabled,
            withholdingAmount: withholdingAmount ?? 0,
            cashReceived,
            note,
            docSyncedAt: serverTimestamp(),
        });

        // 2. Create Accounting Entry
        const entryRef = doc(collection(db, "accountingEntries"));
        batch.set(entryRef, {
            entryType: "CASH_IN",
            entryDate: receivedDate,
            amount: cashReceived,
            accountId,
            paymentMethod,
            description: `รับเงินจาก ${approvingClaim.customerNameSnapshot || 'ไม่ระบุ'} (เอกสาร: ${approvingClaim.sourceDocNo})`,
            sourceDocType: approvingClaim.sourceDocType,
            sourceDocId: approvingClaim.sourceDocId,
            sourceDocNo: approvingClaim.sourceDocNo,
            customerNameSnapshot: approvingClaim.customerNameSnapshot,
            jobId: approvingClaim.jobId,
            createdAt: serverTimestamp(),
        });

        // 3. Update Source Document
        batch.update(sourceDocRef, {
            status: 'PAID',
            paymentMethod: paymentMethod,
            paymentDate: receivedDate,
            receivedAccountId: accountId,
            cashReceived: cashReceived,
            withholdingEnabled: withholdingEnabled,
            withholdingAmount: withholdingAmount ?? 0,
            updatedAt: serverTimestamp(),
        });

        await batch.commit();
        toast({ title: "ยืนยันการรับเงินสำเร็จ" });
        setApprovingClaim(null);

    } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
};
  
  const handleRejectConfirm = async (reason: string) => {
    if (!db || !profile || !rejectingClaim) return;
    
    const claimRef = doc(db, "paymentClaims", rejectingClaim.id);
    try {
      await writeBatch(db).update(claimRef, {
          status: "REJECTED",
          rejectedAt: serverTimestamp(),
          rejectedByUid: profile.uid,
          rejectedByName: profile.displayName,
          rejectReason: reason,
      }).commit();
      toast({ title: "ตีกลับรายการสำเร็จ" });
      setRejectingClaim(null);
    } catch(e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };


  if (!hasPermission) {
    return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle><CardDescription>หน้านี้สำหรับผู้ดูแลและฝ่ายบริหารเท่านั้น</CardDescription></CardHeader></Card>;
  }

  return (
    <>
      <PageHeader title="รอตรวจสอบรายรับ" description="ตรวจสอบและยืนยันการรับเงินจากเอกสารต่างๆ" />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ClaimStatus)}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="PENDING">รอตรวจสอบ</TabsTrigger>
            <TabsTrigger value="APPROVED">ยืนยันแล้ว</TabsTrigger>
            <TabsTrigger value="REJECTED">ตีกลับ</TabsTrigger>
          </TabsList>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาจากเลขที่เอกสาร, ชื่อลูกค้า, หมายเหตุ..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10"/>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>วันที่แจ้ง</TableHead><TableHead>ลูกค้า</TableHead><TableHead>เอกสารอ้างอิง</TableHead><TableHead>ยอดตามบิล</TableHead><TableHead>เงินเข้าจริง</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                : filteredClaims.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center h-24">ไม่พบรายการ</TableCell></TableRow>
                : filteredClaims.map(claim => (
                    <TableRow key={claim.id}>
                        <TableCell>{safeFormat(claim.createdAt, "dd/MM/yy HH:mm")}</TableCell>
                        <TableCell>{claim.customerNameSnapshot}</TableCell>
                        <TableCell>{claim.sourceDocNo}</TableCell>
                        <TableCell>{formatCurrency(claim.amountDue)}</TableCell>
                        <TableCell>{claim.status === 'APPROVED' ? formatCurrency(claim.cashReceived ?? 0) : '-'}</TableCell>
                        <TableCell><Badge variant={claim.status === 'APPROVED' ? 'default' : claim.status === 'REJECTED' ? 'destructive' : 'secondary'}>{claim.status}</Badge></TableCell>
                        <TableCell className="text-right">
                            {claim.status === 'PENDING' && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onSelect={() => setApprovingClaim(claim)}><CheckCircle className="mr-2"/>ยืนยันรับเงิน</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setRejectingClaim(claim)} className="text-destructive"><XCircle className="mr-2"/>ตีกลับ</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Tabs>
      {approvingClaim && <ApproveClaimDialog claim={approvingClaim} accounts={accounts} onClose={() => setApprovingClaim(null)} onConfirm={handleApproveConfirm} />}
      {rejectingClaim && <RejectClaimDialog claim={rejectingClaim} onClose={() => setRejectingClaim(null)} onConfirm={handleRejectConfirm} />}
    </>
  );
}
