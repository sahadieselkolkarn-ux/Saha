"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase/client-provider";
import { collection, query, onSnapshot, where, doc, writeBatch, serverTimestamp, getDoc, type FirestoreError, updateDoc, runTransaction } from "firebase/firestore";
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
import { Loader2, Search, CheckCircle, Ban, HandCoins, MoreHorizontal, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WithId } from "@/firebase/firestore/use-collection";
import type { Document as DocumentType, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";
import { archiveAndCloseJob } from '@/firebase/jobs-archive';

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
        const defaultAccount = accounts.find(a => a.type === 'CASH') || accounts[0];
        setSelectedAccountId(defaultAccount.id);
    }
  }, [accounts, selectedAccountId]);

  const filteredDocs = useMemo(() => {
    const filteredByTab = documents.filter(doc => {
      if (activeTab === 'receive') {
        return (doc.docType === 'DELIVERY_NOTE' || doc.docType === 'TAX_INVOICE') && doc.paymentTerms === 'CASH';
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
      (doc.customerSnapshot?.name || '').toLowerCase().includes(lowerSearch)
    );
  }, [documents, activeTab, searchTerm]);

  const handleConfirmCashPayment = async () => {
    if (!db || !profile || !confirmingDoc || !selectedAccountId) return;
    setIsSubmitting(true);
    
    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'documents', confirmingDoc.id);
        const docSnap = await transaction.get(docRef);
        
        if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
        const docData = docSnap.data();
        
        if (docData.arStatus !== 'PENDING' || docData.status === 'APPROVED' || docData.accountingEntryId) {
          throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
        }

        const entryId = `SALE_${confirmingDoc.id}`;
        const entryRef = doc(db, 'accountingEntries', entryId);
        const arId = `AR_OBL_${confirmingDoc.id}`;
        const arRef = doc(db, 'accountingObligations', arId);

        // 1. Create entry (Idempotent by SALE_{id})
        transaction.set(entryRef, {
          entryType: 'CASH_IN', 
          entryDate: confirmingDoc.docDate, 
          amount: confirmingDoc.grandTotal, 
          accountId: selectedAccountId,
          paymentMethod: 'CASH', 
          description: `รับเงินสดจาก ${confirmingDoc.customerSnapshot.name} (เอกสาร: ${confirmingDoc.docNo})`,
          sourceDocId: confirmingDoc.id, 
          sourceDocNo: confirmingDoc.docNo, 
          sourceDocType: confirmingDoc.docType,
          customerNameSnapshot: confirmingDoc.customerSnapshot.name, 
          jobId: confirmingDoc.jobId,
          createdAt: serverTimestamp(),
        });

        // 2. Create AR obligation marked as PAID
        transaction.set(arRef, {
          type: 'AR', 
          status: 'PAID', 
          sourceDocType: confirmingDoc.docType, 
          sourceDocId: confirmingDoc.id, 
          sourceDocNo: confirmingDoc.docNo,
          amountTotal: confirmingDoc.grandTotal, 
          amountPaid: confirmingDoc.grandTotal, 
          balance: 0,
          createdAt: serverTimestamp(), 
          updatedAt: serverTimestamp(), 
          paidOffDate: confirmingDoc.docDate,
          customerNameSnapshot: confirmingDoc.customerSnapshot.name,
        });

        // 3. Update doc status
        transaction.update(docRef, { 
            arStatus: 'PAID',
            status: 'APPROVED', // Change from PENDING_REVIEW to APPROVED
            paymentSummary: {
                paidTotal: confirmingDoc.grandTotal,
                balance: 0,
                paymentStatus: 'PAID'
            },
            accountingEntryId: entryId,
            arObligationId: arId,
            updatedAt: serverTimestamp()
        });
      });

      // 4. Archive job after transaction success
      if (confirmingDoc.jobId) {
          const salesDocInfo = {
              salesDocType: confirmingDoc.docType,
              salesDocId: confirmingDoc.id,
              salesDocNo: confirmingDoc.docNo,
              paymentStatusAtClose: 'PAID' as const
          };
          await archiveAndCloseJob(db, confirmingDoc.jobId, confirmingDoc.docDate, profile, salesDocInfo);
      }

      toast({ title: "ยืนยันการรับเงินและปิดงานสำเร็จ" });
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
        await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'documents', docToProcess.id);
            const docSnap = await transaction.get(docRef);
            
            if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
            const docData = docSnap.data();
            
            if (docData.arStatus !== 'PENDING' || docData.status === 'APPROVED' || docData.arObligationId) {
                throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
            }

            const arId = `AR_OBL_${docToProcess.id}`;
            const arRef = doc(db, 'accountingObligations', arId);

            // 1. Create AR obligation (Idempotent by AR_OBL_{id})
            transaction.set(arRef, {
                type: 'AR', 
                status: 'UNPAID', 
                sourceDocType: docToProcess.docType, 
                sourceDocId: docToProcess.id, 
                sourceDocNo: docToProcess.docNo,
                amountTotal: docToProcess.grandTotal, 
                amountPaid: 0, 
                balance: docToProcess.grandTotal,
                createdAt: serverTimestamp(), 
                updatedAt: serverTimestamp(), 
                dueDate: docToProcess.dueDate || null,
                customerNameSnapshot: docToProcess.customerSnapshot.name,
            });

            // 2. Update doc status
            transaction.update(docRef, { 
                arStatus: 'UNPAID',
                status: 'APPROVED',
                arObligationId: arId,
                updatedAt: serverTimestamp()
            });
        });

        // 3. Archive job after transaction success
        if (docToProcess.jobId) {
            const salesDocInfo = {
                salesDocType: docToProcess.docType,
                salesDocId: docToProcess.id,
                salesDocNo: docToProcess.docNo,
                paymentStatusAtClose: 'UNPAID' as const
            };
            await archiveAndCloseJob(db, docToProcess.jobId, docToProcess.docDate, profile, salesDocInfo);
        }

        toast({ title: 'ยืนยันรายการขายเครดิตและปิดงานสำเร็จ' });
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
        status: 'REJECTED',
        reviewRejectReason: disputeReason,
        reviewRejectedAt: serverTimestamp(),
        reviewRejectedByName: profile.displayName,
        dispute: { isDisputed: true, reason: disputeReason, createdAt: serverTimestamp() }
      });
      toast({ title: "บันทึกข้อโต้แย้งและตีกลับสำเร็จ" });
      setDisputingDoc(null);
    } catch(e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission) return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle><CardDescription>สำหรับฝ่ายบริหารเท่านั้น</CardDescription></CardHeader></Card>;

  return (
    <>
      <PageHeader title="Inbox บัญชี (ตรวจสอบรายการขาย)" description="พี่ถินตรวจสอบความถูกต้องของบิลก่อนลงบัญชีและปิดงาน" />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <TabsList>
            <TabsTrigger value="receive">รอรับเงิน (Cash)</TabsTrigger>
            <TabsTrigger value="ar">รอตั้งลูกหนี้ (Credit)</TabsTrigger>
          </TabsList>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาเลขที่เอกสาร, ชื่อลูกค้า..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10"/>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TabsContent value="receive" className="mt-0">
              <Table>
                <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ลูกค้า</TableHead><TableHead>เอกสาร</TableHead><TableHead>ยอดเงิน</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  : filteredDocs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่มีรายการรอตรวจสอบ</TableCell></TableRow>
                  : filteredDocs.map(doc => (
                      <TableRow key={doc.id}>
                          <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                          <TableCell>{doc.customerSnapshot?.name || '--'}</TableCell>
                          <TableCell>
                            <div className="font-medium">{doc.docNo}</div>
                            <div className="text-xs text-muted-foreground">{doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'}</div>
                          </TableCell>
                          <TableCell className="font-bold text-primary">{formatCurrency(doc.grandTotal)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/app/documents/${doc.id}`)} title="ดูเอกสาร">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => setConfirmingDoc(doc)} className="text-green-600 focus:text-green-600">
                                            <CheckCircle className="mr-2 h-4 w-4"/> ยืนยันรับเงินและปิดงาน
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setDisputingDoc(doc)} className="text-destructive focus:text-destructive">
                                            <Ban className="mr-2 h-4 w-4"/> ตีกลับให้แก้ไข
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                          </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="ar" className="mt-0">
              <Table>
                <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ลูกค้า</TableHead><TableHead>เอกสาร</TableHead><TableHead>ยอดเงิน</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  : filteredDocs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่มีรายการรอตั้งลูกหนี้</TableCell></TableRow>
                  : filteredDocs.map(doc => (
                      <TableRow key={doc.id}>
                          <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                          <TableCell>{doc.customerSnapshot?.name || '--'}</TableCell>
                          <TableCell>
                            <div className="font-medium">{doc.docNo}</div>
                            <div className="text-xs text-muted-foreground">{doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'}</div>
                          </TableCell>
                          <TableCell className="font-bold text-amber-600">{formatCurrency(doc.grandTotal)}</TableCell>
                           <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/app/documents/${doc.id}`)} title="ดูเอกสาร">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => handleCreateAR(doc)} disabled={isSubmitting}>
                                            <HandCoins className="mr-2 h-4 w-4"/> ยืนยันเครดิตและปิดงาน
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setDisputingDoc(doc)} className="text-destructive focus:text-destructive">
                                            <Ban className="mr-2 h-4 w-4"/> ตีกลับให้แก้ไข
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
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
            <DialogTitle>ยืนยันการรับเงินสด/โอน</DialogTitle>
            <DialogDescription>สำหรับเอกสารเลขที่: {confirmingDoc?.docNo} - เมื่อยืนยันแล้ว ระบบจะลงบัญชีรายรับและปิดงานซ่อมนี้ทันที</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground">ยอดเงินรวมสุทธิ</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(confirmingDoc?.grandTotal ?? 0)} บาท</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account">เข้าบัญชีที่รับเงิน</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger><SelectValue placeholder="เลือกบัญชีที่รับเงิน..."/></SelectTrigger>
                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type === 'CASH' ? 'เงินสด' : 'ธนาคาร'})</SelectItem>)}</SelectContent>
                </Select>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button onClick={handleConfirmCashPayment} disabled={isSubmitting || !selectedAccountId}>{isSubmitting && <Loader2 className="mr-2 animate-spin" />}ยืนยันการรับเงิน</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disputingDoc} onOpenChange={(open) => !open && setDisputingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ส่งเอกสารกลับเพื่อแก้ไข</DialogTitle>
            <DialogDescription>สำหรับเอกสารเลขที่: {disputingDoc?.docNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="reason">ระบุเหตุผลที่ไม่ถูกต้อง (จะปรากฏให้ฝ่ายออฟฟิศเห็น)</Label>
            <Textarea id="reason" placeholder="เช่น ยอดเงินไม่ตรงกับสลิปโอนเงิน, เลือกประเภทลูกค้าผิด..." value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleDispute} disabled={isSubmitting || !disputeReason}>{isSubmitting && <Loader2 className="mr-2 animate-spin" />}ยืนยันตีกลับ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
