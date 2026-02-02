
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, onSnapshot, orderBy, where, doc, writeBatch, serverTimestamp, getDoc, type FirestoreError, addDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, CheckCircle, Ban, HandCoins } from "lucide-react";
import { WithId } from "@/firebase/firestore/use-collection";
import type { Document as DocumentType, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

const formatCurrency = (value: number) => (value ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AccountingInboxPage() {
  const { profile } = useAuth();
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [documents, setDocuments] = useState<WithId<DocumentType>[]>([]);
  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"receive" | "ar">("receive");

  const [confirmingDoc, setConfirmingDoc] = useState<WithId<DocumentType> | null>(null);
  const [disputingDoc, setDisputingDoc] = useState<WithId<DocumentType> | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  useEffect(() => {
    if (!db || !hasPermission) {
      setLoading(false);
      return;
    }

    const docsQuery = query(collection(db, "documents"), where("arStatus", "==", "PENDING"));
    const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));

    const unsubDocs = onSnapshot(docsQuery, 
      (snap) => { setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<DocumentType>))); setLoading(false); },
      (err) => { toast({ variant: 'destructive', title: "Error loading documents", description: err.message }); setLoading(false); }
    );
    const unsubAccounts = onSnapshot(accountsQuery, 
      (snap) => setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>)))
    );
    return () => { unsubDocs(); unsubAccounts(); };
  }, [db, toast, hasPermission]);
  
  useEffect(() => {
    if(accounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const filteredDocs = useMemo(() => {
    const filteredByTab = documents.filter(doc => {
      if (activeTab === 'receive') {
        return doc.docType === 'DELIVERY_NOTE' && doc.paymentTerms === 'CASH';
      }
      if (activeTab === 'ar') {
        return (doc.docType === 'DELIVERY_NOTE' || doc.docType === 'TAX_INVOICE') && doc.paymentTerms === 'CREDIT';
      }
      return false;
    });

    if (!searchTerm) return filteredByTab;
    const lowerSearch = searchTerm.toLowerCase();
    return filteredByTab.filter(doc => 
      doc.docNo.toLowerCase().includes(lowerSearch) ||
      doc.customerSnapshot?.name?.toLowerCase().includes(lowerSearch)
    );
  }, [documents, activeTab, searchTerm]);

  const handleConfirmCashPayment = async () => {
    if (!db || !profile || !confirmingDoc || !selectedAccountId) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const arRef = doc(collection(db, 'accountingObligations'));
      batch.set(arRef, {
        type: 'AR', status: 'PAID', sourceDocType: confirmingDoc.docType, sourceDocId: confirmingDoc.id, sourceDocNo: confirmingDoc.docNo,
        amountTotal: confirmingDoc.grandTotal, amountPaid: confirmingDoc.grandTotal, balance: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), paidOffDate: confirmingDoc.docDate,
        customerNameSnapshot: confirmingDoc.customerSnapshot.name,
      });

      const entryRef = doc(collection(db, 'accountingEntries'));
      batch.set(entryRef, {
        entryType: 'CASH_IN', entryDate: confirmingDoc.docDate, amount: confirmingDoc.grandTotal, accountId: selectedAccountId,
        paymentMethod: 'CASH', description: `รับเงินสดจาก ${confirmingDoc.customerSnapshot.name} (เอกสาร: ${confirmingDoc.docNo})`,
        sourceDocId: confirmingDoc.id, sourceDocNo: confirmingDoc.docNo, sourceDocType: confirmingDoc.docType,
        customerNameSnapshot: confirmingDoc.customerSnapshot.name, jobId: confirmingDoc.jobId,
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, 'documents', confirmingDoc.id), { arStatus: 'PAID' });
      
      await batch.commit();
      toast({ title: "ยืนยันการรับเงินสำเร็จ" });
      setConfirmingDoc(null);
    } catch(e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAR = async (docToProcess: WithId<DocumentType>) => {
    if (!db || !profile) return;
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);
        const arRef = doc(collection(db, 'accountingObligations'));
        batch.set(arRef, {
            type: 'AR', status: 'UNPAID', sourceDocType: docToProcess.docType, sourceDocId: docToProcess.id, sourceDocNo: docToProcess.docNo,
            amountTotal: docToProcess.grandTotal, amountPaid: 0, balance: docToProcess.grandTotal,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(), dueDate: docToProcess.dueDate || null,
            customerNameSnapshot: docToProcess.customerSnapshot.name,
        });
        batch.update(doc(db, 'documents', docToProcess.id), { arStatus: 'UNPAID' });
        await batch.commit();
        toast({ title: 'สร้างลูกหนี้สำเร็จ' });
    } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleDispute = async () => {
    if (!db || !profile || !disputingDoc || !disputeReason) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'documents', disputingDoc.id), {
        arStatus: 'DISPUTED',
        dispute: { isDisputed: true, reason: disputeReason, createdAt: serverTimestamp() }
      });
      toast({ title: "บันทึกข้อโต้แย้งสำเร็จ" });
      setDisputingDoc(null);
    } catch(e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission) return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle><CardDescription>สำหรับฝ่ายบริหาร/บัญชีเท่านั้น</CardDescription></CardHeader></Card>;

  return (
    <>
      <PageHeader title="Inbox บัญชี" description="ศูนย์กลางตรวจสอบและจัดการเอกสารทางการเงิน" />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="receive">รอรับเงิน (เงินสด)</TabsTrigger>
            <TabsTrigger value="ar">รอตั้งลูกหนี้ (เครดิต)</TabsTrigger>
          </TabsList>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาจากเลขที่เอกสาร, ชื่อลูกค้า..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10"/>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TabsContent value="receive">
              <Table>
                <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ลูกค้า</TableHead><TableHead>เอกสาร</TableHead><TableHead>ยอดเงิน</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  : filteredDocs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่พบรายการ</TableCell></TableRow>
                  : filteredDocs.map(doc => (
                      <TableRow key={doc.id}>
                          <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                          <TableCell>{doc.customerSnapshot.name}</TableCell>
                          <TableCell>{doc.docNo} ({doc.docType})</TableCell>
                          <TableCell>{formatCurrency(doc.grandTotal)}</TableCell>
                          <TableCell className="text-right">
                              <Button size="sm" onClick={() => setConfirmingDoc(doc)}><CheckCircle className="mr-2"/>ยืนยันรับเงิน</Button>
                          </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="ar">
              <Table>
                <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ลูกค้า</TableHead><TableHead>เอกสาร</TableHead><TableHead>ยอดเงิน</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  : filteredDocs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่พบรายการ</TableCell></TableRow>
                  : filteredDocs.map(doc => (
                      <TableRow key={doc.id}>
                          <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                          <TableCell>{doc.customerSnapshot.name}</TableCell>
                          <TableCell>{doc.docNo} ({doc.docType})</TableCell>
                          <TableCell>{formatCurrency(doc.grandTotal)}</TableCell>
                          <TableCell className="text-right space-x-2">
                              <Button size="sm" variant="secondary" onClick={() => setDisputingDoc(doc)}><Ban className="mr-2"/>ข้อโต้แย้ง</Button>
                              <Button size="sm" onClick={() => handleCreateAR(doc)} disabled={isSubmitting}><HandCoins className="mr-2"/>สร้างลูกหนี้</Button>
                          </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
      <Dialog open={!!confirmingDoc} onOpenChange={(open) => !open && setConfirmingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการรับเงิน (เงินสด)</DialogTitle>
            <DialogDescription>สำหรับเอกสารเลขที่: {confirmingDoc?.docNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
              <p>ยอดเงิน: <span className="font-bold">{formatCurrency(confirmingDoc?.grandTotal ?? 0)}</span></p>
              <div className="space-y-2">
                <Label htmlFor="account">เข้าบัญชี</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger>
                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button onClick={handleConfirmCashPayment} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin" />}ยืนยัน</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!disputingDoc} onOpenChange={(open) => !open && setDisputingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งเป็นข้อโต้แย้ง</DialogTitle>
            <DialogDescription>สำหรับเอกสารเลขที่: {disputingDoc?.docNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4"><Textarea placeholder="กรุณาระบุเหตุผล..." value={disputeReason} onChange={e => setDisputeReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleDispute} disabled={isSubmitting || !disputeReason}>{isSubmitting && <Loader2 className="mr-2 animate-spin" />}ยืนยัน</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    