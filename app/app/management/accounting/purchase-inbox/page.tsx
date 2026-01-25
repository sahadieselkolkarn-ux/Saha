
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, onSnapshot, orderBy, doc, writeBatch, serverTimestamp, getDoc, type FirestoreError } from "firebase/firestore";
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
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Search, MoreHorizontal, CheckCircle, XCircle } from "lucide-react";
import { WithId } from "@/firebase/firestore/use-collection";
import { PurchaseClaim, AccountingAccount, PurchaseDoc } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const cashApprovalSchema = z.object({
  paidDate: z.string().min(1, "กรุณาเลือกวันที่จ่ายเงิน"),
  paymentMethod: z.enum(["CASH", "TRANSFER"], { required_error: "กรุณาเลือกช่องทาง" }),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
});

function ApproveCashDialog({ claim, accounts, onClose, onConfirm }: { claim: WithId<PurchaseClaim>, accounts: WithId<AccountingAccount>[], onClose: () => void, onConfirm: (formData: z.infer<typeof cashApprovalSchema>) => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<z.infer<typeof cashApprovalSchema>>({
    resolver: zodResolver(cashApprovalSchema),
    defaultValues: {
      paidDate: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: claim.suggestedPaymentMethod,
      accountId: claim.suggestedAccountId,
    },
  });

  const handleSubmit = async (data: z.infer<typeof cashApprovalSchema>) => {
    setIsLoading(true);
    await onConfirm(data);
    setIsLoading(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยันการจ่ายเงิน (เงินสด)</DialogTitle>
          <DialogDescription>สำหรับเอกสาร: {claim.purchaseDocNo}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="approve-cash-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="paidDate" render={({ field }) => (<FormItem><FormLabel>วันที่จ่ายเงิน</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accountId" render={({ field }) => (<FormItem><FormLabel>บัญชีที่จ่าย</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="text-right font-bold text-lg">ยอดจ่าย: {formatCurrency(claim.amountTotal)}</div>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>ยกเลิก</Button>
          <Button type="submit" form="approve-cash-form" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 animate-spin" />}ยืนยันการจ่าย</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectClaimDialog({ claim, onClose, onConfirm }: { claim: WithId<PurchaseClaim>, onClose: () => void, onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = async () => {
    if (!reason) {
      toast({ variant: "destructive", title: "กรุณากรอกเหตุผล" });
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
          <DialogDescription>สำหรับเอกสาร: {claim.purchaseDocNo}</DialogDescription>
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

export default function PurchaseInboxPage() {
  const { profile } = useAuth();
  const { db } = useFirebase();
  const { toast } = useToast();
  
  const [claims, setClaims] = useState<WithId<PurchaseClaim>[]>([]);
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<ClaimStatus>("PENDING");

  const [approvingClaim, setApprovingClaim] = useState<WithId<PurchaseClaim> | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<WithId<PurchaseClaim> | null>(null);

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  useEffect(() => {
    if (!db || !hasPermission) {
      setLoading(false);
      return;
    }
    const claimsQuery = query(collection(db, "purchaseClaims"), orderBy("createdAt", "desc"));
    const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    
    const unsubClaims = onSnapshot(claimsQuery, 
      (snap) => { setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<PurchaseClaim>))); setLoading(false); },
      (error: FirestoreError) => {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาดในการโหลดข้อมูล", description: error.message });
        setLoading(false);
      }
    );

    const unsubAccounts = onSnapshot(accountsQuery, 
      (snap) => { setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>))); },
      (error: FirestoreError) => {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาดในการโหลดข้อมูลบัญชี", description: error.message });
      }
    );

    return () => { unsubClaims(); unsubAccounts(); };
  }, [db, toast, hasPermission]);
  
  const filteredClaims = useMemo(() => {
    let filtered = claims.filter(c => c.status === activeTab);
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(c => 
            c.purchaseDocNo.toLowerCase().includes(lowerSearch) ||
            c.vendorNameSnapshot?.toLowerCase().includes(lowerSearch) ||
            c.invoiceNo?.toLowerCase().includes(lowerSearch) ||
            c.note?.toLowerCase().includes(lowerSearch)
        );
    }
    return filtered;
  }, [claims, activeTab, searchTerm]);

  const handleApproveCash = async (formData: z.infer<typeof cashApprovalSchema>) => {
    if (!db || !profile || !approvingClaim) return;
    try {
        const purchaseDocRef = doc(db, 'purchaseDocs', approvingClaim.purchaseDocId);
        const purchaseDocSnap = await getDoc(purchaseDocRef);
        if (!purchaseDocSnap.exists()) throw new Error(`ไม่พบเอกสารจัดซื้อเลขที่ ${approvingClaim.purchaseDocNo}`);
        
        const batch = writeBatch(db);
        const claimRef = doc(db, 'purchaseClaims', approvingClaim.id);
        const entryRef = doc(collection(db, 'accountingEntries'));

        batch.update(claimRef, { status: 'APPROVED', approvedAt: serverTimestamp(), approvedByUid: profile.uid, approvedByName: profile.displayName });
        batch.set(entryRef, {
            entryType: 'CASH_OUT',
            entryDate: formData.paidDate,
            amount: approvingClaim.amountTotal,
            accountId: formData.accountId,
            paymentMethod: formData.paymentMethod,
            description: `จ่ายค่าสินค้า/อะไหล่: ${approvingClaim.vendorNameSnapshot} (บิล: ${approvingClaim.invoiceNo})`,
            sourceDocId: approvingClaim.purchaseDocId,
            sourceDocNo: approvingClaim.purchaseDocNo,
            sourceDocType: 'PURCHASE',
            vendorNameSnapshot: approvingClaim.vendorNameSnapshot,
            createdAt: serverTimestamp(),
        });
        batch.update(purchaseDocRef, { status: 'PAID', approvedAt: serverTimestamp(), approvedByUid: profile.uid, approvedByName: profile.displayName, accountingEntryId: entryRef.id });
        await batch.commit();
        toast({ title: "อนุมัติและบันทึกการจ่ายเงินสำเร็จ" });
        setApprovingClaim(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };
  
  const handleApproveCredit = async () => {
     if (!db || !profile || !approvingClaim) return;
     try {
        const purchaseDocRef = doc(db, 'purchaseDocs', approvingClaim.purchaseDocId);
        const purchaseDocSnap = await getDoc(purchaseDocRef);
        if (!purchaseDocSnap.exists()) throw new Error(`ไม่พบเอกสารจัดซื้อเลขที่ ${approvingClaim.purchaseDocNo}`);
        const purchaseDocData = purchaseDocSnap.data() as PurchaseDoc;

        const batch = writeBatch(db);
        const claimRef = doc(db, 'purchaseClaims', approvingClaim.id);
        const apObligationRef = doc(collection(db, 'accountingObligations'));
        
        batch.update(claimRef, { status: 'APPROVED', approvedAt: serverTimestamp(), approvedByUid: profile.uid, approvedByName: profile.displayName });
        batch.set(apObligationRef, {
            type: 'AP', status: 'UNPAID',
            vendorId: purchaseDocData.vendorId,
            vendorShortNameSnapshot: purchaseDocData.vendorSnapshot.shortName,
            vendorNameSnapshot: purchaseDocData.vendorSnapshot.companyName,
            invoiceNo: purchaseDocData.invoiceNo,
            sourceDocType: 'PURCHASE', sourceDocId: purchaseDocData.id, sourceDocNo: purchaseDocData.docNo,
            docDate: purchaseDocData.docDate, dueDate: purchaseDocData.dueDate,
            amountTotal: purchaseDocData.grandTotal, amountPaid: 0, balance: purchaseDocData.grandTotal,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        batch.update(purchaseDocRef, { status: 'UNPAID', approvedAt: serverTimestamp(), approvedByUid: profile.uid, approvedByName: profile.displayName, apObligationId: apObligationRef.id });
        
        await batch.commit();
        toast({ title: "อนุมัติและสร้างเจ้าหนี้สำเร็จ" });
        setApprovingClaim(null);
     } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
     }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!db || !profile || !rejectingClaim) return;
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'purchaseClaims', rejectingClaim.id), { status: 'REJECTED', rejectedAt: serverTimestamp(), rejectedByUid: profile.uid, rejectedByName: profile.displayName, rejectReason: reason });
        batch.update(doc(db, 'purchaseDocs', rejectingClaim.purchaseDocId), { status: 'CANCELLED' });
        await batch.commit();
        toast({ title: "ตีกลับรายการสำเร็จ" });
        setRejectingClaim(null);
    } catch(e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };

  if (!hasPermission) {
    return (
        <>
            <PageHeader title="รอตรวจสอบรายจ่าย" />
            <Card className="text-center py-12">
                <CardHeader>
                    <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                    <CardDescription>สำหรับฝ่ายบริหาร/ผู้ดูแลเท่านั้น</CardDescription>
                </CardHeader>
            </Card>
        </>
    );
  }

  return (
    <>
      <PageHeader title="รอตรวจสอบรายจ่าย" description="ตรวจสอบและยืนยันการขออนุมัติจัดซื้อ/จ่ายเงิน" />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ClaimStatus)}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="PENDING">รอตรวจสอบ</TabsTrigger>
            <TabsTrigger value="APPROVED">ยืนยันแล้ว</TabsTrigger>
            <TabsTrigger value="REJECTED">ตีกลับ</TabsTrigger>
          </TabsList>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาจากเลขที่เอกสาร, ชื่อร้านค้า, เลขบิล..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10"/>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>วันที่แจ้ง</TableHead><TableHead>ร้านค้า</TableHead><TableHead>เลขที่เอกสาร/บิล</TableHead><TableHead>ยอดเงิน</TableHead><TableHead>รูปแบบ</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                : filteredClaims.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center h-24">ไม่พบรายการ</TableCell></TableRow>
                : filteredClaims.map(claim => (
                    <TableRow key={claim.id}>
                        <TableCell>{safeFormat(claim.createdAt, "dd/MM/yy HH:mm")}</TableCell>
                        <TableCell>{claim.vendorNameSnapshot}</TableCell>
                        <TableCell>{claim.purchaseDocNo} / {claim.invoiceNo}</TableCell>
                        <TableCell>{formatCurrency(claim.amountTotal)}</TableCell>
                        <TableCell><Badge variant={claim.paymentMode === 'CASH' ? 'default' : 'outline'}>{claim.paymentMode}</Badge></TableCell>
                        <TableCell><Badge variant={claim.status === 'APPROVED' ? 'default' : claim.status === 'REJECTED' ? 'destructive' : 'secondary'}>{claim.status}</Badge></TableCell>
                        <TableCell className="text-right">
                            {claim.status === 'PENDING' && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onSelect={() => setApprovingClaim(claim)}><CheckCircle className="mr-2"/>อนุมัติ</DropdownMenuItem>
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
      {approvingClaim?.paymentMode === 'CASH' && <ApproveCashDialog claim={approvingClaim} accounts={accounts} onClose={() => setApprovingClaim(null)} onConfirm={handleApproveCash} />}
      {approvingClaim?.paymentMode === 'CREDIT' && (
          <AlertDialog open={true} onOpenChange={(open) => !open && setApprovingClaim(null)}>
              <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>ยืนยันการอนุมัติ (เครดิต)</AlertDialogTitle><AlertDialogDescription>ต้องการอนุมัติรายการนี้และสร้างเป็นเจ้าหนี้การค้า (AP) หรือไม่?</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApproveCredit}>ยืนยัน</AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
      )}
      {rejectingClaim && <RejectClaimDialog claim={rejectingClaim} onClose={() => setRejectingClaim(null)} onConfirm={handleRejectConfirm} />}
    </>
  );
}
