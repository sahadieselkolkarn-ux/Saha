"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase/client-provider";
import { collection, query, onSnapshot, where, doc, serverTimestamp, type FirestoreError, updateDoc, runTransaction, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { format } from "date-fns";

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
import { Loader2, Search, CheckCircle, Ban, HandCoins, MoreHorizontal, Eye, AlertCircle, ExternalLink, Calendar } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WithId } from "@/firebase/firestore/use-collection";
import type { Document as DocumentType, AccountingAccount, Job } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";
import { moveJobActivities } from '@/firebase/jobs-archive';
import { getYearFromDateOnly, archiveCollectionNameByYear } from '@/lib/archive-utils';
import { sanitizeForFirestore } from '@/lib/utils';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);

  const [confirmingDoc, setConfirmingDoc] = useState<WithId<DocumentType> | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [disputingDoc, setDisputingDoc] = useState<WithId<DocumentType> | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [selectedPaymentDate, setSelectedPaymentDate] = useState("");
  
  const [arDocToConfirm, setArDocToConfirm] = useState<WithId<DocumentType> | null>(null);

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT', [profile]);

  const docsQuery = useMemo(() => {
    if (!db || !hasPermission) return null;
    return query(
      collection(db, "documents"), 
      where("arStatus", "==", "PENDING"),
      limit(200)
    );
  }, [db, hasPermission]);

  const accountsQuery = useMemo(() => {
    if (!db || !hasPermission) return null;
    return query(
      collection(db, "accountingAccounts"), 
      where("isActive", "==", true)
    );
  }, [db, hasPermission]);

  useEffect(() => {
    if (!hasPermission || !docsQuery || !accountsQuery) {
      if (!hasPermission) setLoading(false);
      return;
    }

    const unsubDocs = onSnapshot(docsQuery, 
      (snap) => { 
        setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<DocumentType>))); 
        setLoading(false);
        setIndexCreationUrl(null);
      },
      (err: FirestoreError) => { 
        console.error("Firestore error in docsQuery:", err);
        if (err.message?.includes('requires an index')) {
            const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
            if (urlMatch) setIndexCreationUrl(urlMatch[0]);
        }
        setLoading(false); 
      }
    );

    const unsubAccounts = onSnapshot(accountsQuery, 
      (snap) => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<AccountingAccount>));
          data.sort((a, b) => a.name.localeCompare(b.name, 'th'));
          setAccounts(data);
      },
      (err: FirestoreError) => {
          console.error("Firestore error in accountsQuery:", err);
      }
    );

    return () => { unsubDocs(); unsubAccounts(); };
  }, [hasPermission, docsQuery, accountsQuery]);
  
  const getInitialAccountId = (doc: DocumentType, availableAccounts: AccountingAccount[]) => {
    if (availableAccounts.length === 0) return "";
    if (doc.suggestedAccountId && availableAccounts.some(a => a.id === doc.suggestedAccountId)) {
        return doc.suggestedAccountId;
    }
    const cashAccount = availableAccounts.find(a => a.type === 'CASH');
    if (cashAccount) return cashAccount.id;
    return availableAccounts[0].id;
  };

  const handleOpenConfirmDialog = (doc: WithId<DocumentType>) => {
    setConfirmError(null);
    setConfirmingDoc(doc);
    const initialId = getInitialAccountId(doc, accounts);
    setSelectedAccountId(initialId);
    setSelectedPaymentMethod(doc.suggestedPaymentMethod || 'CASH');
    setSelectedPaymentDate(doc.docDate || format(new Date(), "yyyy-MM-dd"));
  };

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
    
    setConfirmError(null);
    setIsSubmitting(true);
    
    try {
      const jobId = confirmingDoc.jobId;
      const closedDate = selectedPaymentDate; // Use accounting's confirmed date
      const year = getYearFromDateOnly(closedDate);
      const archiveColName = archiveCollectionNameByYear(year);

      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'documents', confirmingDoc.id);
        const docSnap = await transaction.get(docRef);
        
        if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
        const docData = docSnap.data();
        
        if (docData.arStatus !== 'PENDING' || docData.status === 'PAID') {
          throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
        }

        let jobData: Job | null = null;
        let jobRef = null;
        if (jobId) {
            jobRef = doc(db, 'jobs', jobId);
            const jobSnap = await transaction.get(jobRef);
            if (jobSnap.exists()) {
                jobData = { id: jobSnap.id, ...jobSnap.data() } as Job;
            }
        }

        const entryId = `SALE_${confirmingDoc.id}`;
        const entryRef = doc(db, 'accountingEntries', entryId);
        const arId = `AR_${confirmingDoc.id}`;
        const arRef = doc(db, 'accountingObligations', arId);

        const customerName = confirmingDoc.customerSnapshot?.name || 'Unknown';

        // Set Accounting Entry with correct accounting data
        transaction.set(entryRef, {
          entryType: 'CASH_IN', 
          entryDate: closedDate, 
          amount: confirmingDoc.grandTotal, 
          accountId: selectedAccountId,
          paymentMethod: selectedPaymentMethod, 
          description: `รับเงิน${selectedPaymentMethod === 'CASH' ? 'สด' : 'โอน'}จาก ${customerName} (เอกสาร: ${confirmingDoc.docNo})`,
          sourceDocId: confirmingDoc.id, 
          sourceDocNo: confirmingDoc.docNo, 
          sourceDocType: confirmingDoc.docType,
          customerNameSnapshot: customerName, 
          jobId: jobId || null,
          createdAt: serverTimestamp(),
        });

        // Set Obligation
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
          paidOffDate: closedDate,
          customerNameSnapshot: customerName,
          jobId: jobId || null,
        });

        // Archive Job if exists
        if (jobData && jobRef) {
            const archiveRef = doc(db, archiveColName, jobData.id);
            const salesDocInfo = {
                salesDocType: confirmingDoc.docType,
                salesDocId: confirmingDoc.id,
                salesDocNo: confirmingDoc.docNo,
                paymentStatusAtClose: 'PAID' as const
            };
            const archivedJobData = {
                ...jobData,
                status: 'CLOSED',
                isArchived: true,
                archivedAt: serverTimestamp(),
                archivedAtDate: closedDate,
                closedDate: closedDate,
                closedByName: profile.displayName,
                closedByUid: profile.uid,
                originalJobId: jobData.id,
                ...salesDocInfo,
            };
            transaction.set(archiveRef, sanitizeForFirestore(archivedJobData), { merge: true });
            transaction.delete(jobRef);
        }

        // Update Original Document
        transaction.update(docRef, { 
            arStatus: 'PAID',
            status: 'PAID',
            paymentSummary: {
                paidTotal: confirmingDoc.grandTotal,
                balance: 0,
                paymentStatus: 'PAID'
            },
            accountingEntryId: entryId,
            arObligationId: arId,
            receivedAccountId: selectedAccountId,
            paymentMethod: selectedPaymentMethod,
            paymentDate: closedDate,
            updatedAt: serverTimestamp()
        });
      });

      // Move Activities after main transaction
      if (jobId) {
          await moveJobActivities(db, jobId, archiveColName);
      }

      toast({ title: "ยืนยันการรับเงินและปิดงานสำเร็จ" });
      setConfirmingDoc(null);
      setConfirmError(null);
    } catch(e: any) {
      console.error("Confirm cash failed", e);
      setConfirmError(`ยืนยันไม่สำเร็จ: ${e.message || e.toString()}`);
      toast({ 
        variant: 'destructive', 
        title: "เกิดข้อผิดพลาด", 
        description: e.message || "ไม่สามารถดำเนินการยืนยันรายการได้" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAR = async (docToProcess: WithId<DocumentType>) => {
    if (!db || !profile) return;
    setIsSubmitting(true);
    
    try {
        const jobId = docToProcess.jobId;
        const closedDate = docToProcess.docDate;
        const year = getYearFromDateOnly(closedDate);
        const archiveColName = archiveCollectionNameByYear(year);

        await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'documents', docToProcess.id);
            const docSnap = await transaction.get(docRef);
            
            if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
            const docData = docSnap.data();
            
            if (docData.arStatus !== 'PENDING' || docData.status === 'UNPAID') {
                throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
            }

            let jobData: Job | null = null;
            let jobRef = null;
            if (jobId) {
                jobRef = doc(db, 'jobs', jobId);
                const jobSnap = await transaction.get(jobRef);
                if (jobSnap.exists()) {
                    jobData = { id: jobSnap.id, ...jobSnap.data() } as Job;
                }
            }

            const arId = `AR_${docToProcess.id}`;
            const arRef = doc(db, 'accountingObligations', arId);
            const customerName = docToProcess.customerSnapshot?.name || 'Unknown';

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
                customerNameSnapshot: customerName,
                jobId: jobId || null,
            });

            // Archive Job if exists
            if (jobData && jobRef) {
                const archiveRef = doc(db, archiveColName, jobData.id);
                const salesDocInfo = {
                    salesDocType: docToProcess.docType,
                    salesDocId: docToProcess.id,
                    salesDocNo: docToProcess.docNo,
                    paymentStatusAtClose: 'UNPAID' as const
                };
                const archivedJobData = {
                    ...jobData,
                    status: 'CLOSED',
                    isArchived: true,
                    archivedAt: serverTimestamp(),
                    archivedAtDate: closedDate,
                    closedDate: closedDate,
                    closedByName: profile.displayName,
                    closedByUid: profile.uid,
                    originalJobId: jobData.id,
                    ...salesDocInfo,
                };
                transaction.set(archiveRef, sanitizeForFirestore(archivedJobData), { merge: true });
                transaction.delete(jobRef);
            }

            transaction.update(docRef, { 
                arStatus: 'UNPAID',
                status: 'UNPAID',
                arObligationId: arId,
                updatedAt: serverTimestamp()
            });
        });

        // Move Activities after main transaction
        if (jobId) {
            await moveJobActivities(db, jobId, archiveColName);
        }

        toast({ title: 'ยืนยันรายการขายเครดิตและปิดงานสำเร็จ' });
        setArDocToConfirm(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาดในการยืนยันรายการ", description: e.message });
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
        reviewRejectedByName: profile.displayName || 'Unknown',
        dispute: { isDisputed: true, reason: disputeReason, createdAt: serverTimestamp() }
      });
      toast({ title: "บันทึกข้อโต้แย้งและตีกลับสำเร็จ" });
      setDisputingDoc(null);
    } catch(e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาดในการบันทึก", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission) return <Card><CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle><CardDescription>หน้าจอนี้สำหรับฝ่ายบริหารและบัญชีเท่านั้น</CardDescription></CardHeader></Card>;

  return (
    <>
      <PageHeader title="Inbox บัญชี (ตรวจสอบรายการขาย)" description="ตรวจสอบความถูกต้องของบิลก่อนลงบัญชีและปิดงาน" />
      
      {indexCreationUrl && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>ต้องสร้างดัชนี (Index) ก่อน</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>ฐานข้อมูลต้องการดัชนีเพื่อจัดเรียงข้อมูล กรุณากดสร้างดัชนีตามลิงก์ด้านล่าง (ใช้เวลา 2-3 นาที)</span>
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> สร้าง Index ใน Firebase Console
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/app/office/documents/${doc.id}`)} title="ดูเอกสาร">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => handleOpenConfirmDialog(doc)} className="text-green-600 focus:text-green-600">
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
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/app/office/documents/${doc.id}`)} title="ดูเอกสาร">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => setArDocToConfirm(doc)} disabled={isSubmitting}>
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

      <Dialog open={!!confirmingDoc} onOpenChange={(open) => !open && !isSubmitting && setConfirmingDoc(null)}>
        <DialogContent onInteractOutside={(e) => isSubmitting && e.preventDefault()} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ยืนยันการรับเงินสด/โอน</DialogTitle>
            <DialogDescription className="text-destructive font-bold">
                ฝ่ายบัญชีสามารถแก้ไขวันที่และบัญชีที่ถูกต้องได้ก่อนกดยืนยัน ข้อมูลนี้จะถูกบันทึกลงสมุดบัญชีถาวร
            </DialogDescription>
          </DialogHeader>
          
          {confirmError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>ยืนยันไม่สำเร็จ</AlertTitle>
              <AlertDescription className="text-xs">
                {confirmError}
              </AlertDescription>
            </Alert>
          )}

          <div className="py-4 space-y-6">
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 text-center">
                <p className="text-sm text-muted-foreground">ยอดเงินรวมสุทธิ</p>
                <p className="text-3xl font-bold text-primary">{formatCurrency(confirmingDoc?.grandTotal ?? 0)} บาท</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><Calendar className="h-3 w-3"/> วันที่เงินเข้าจริง</Label>
                        <Input 
                            type="date" 
                            value={selectedPaymentDate} 
                            onChange={(e) => setSelectedPaymentDate(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>ช่องทางที่รับ</Label>
                        <Select value={selectedPaymentMethod} onValueChange={(v: any) => setSelectedPaymentMethod(v)} disabled={isSubmitting}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="CASH">เงินสด</SelectItem>
                                <SelectItem value="TRANSFER">เงินโอน</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="account">เข้าบัญชีที่รับเงิน (บัญชีสามารถแก้ไขได้)</Label>
                    {accounts.length === 0 ? (
                        <div className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3"/> กรุณาเพิ่มบัญชีในเมนูตั้งค่า</div>
                    ) : (
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={isSubmitting}>
                            <SelectTrigger><SelectValue placeholder="เลือกบัญชีที่ถูกต้อง..."/></SelectTrigger>
                            <SelectContent>
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.name} ({acc.type === 'CASH' ? 'เงินสด' : 'ธนาคาร'})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {confirmingDoc?.suggestedAccountId && confirmingDoc.suggestedAccountId !== selectedAccountId && (
                        <p className="text-[10px] text-amber-600 font-medium italic">
                            * ข้อความเดิมจากออฟฟิศ: {accounts.find(a => a.id === confirmingDoc.suggestedAccountId)?.name || 'ไม่ได้ระบุ'}
                        </p>
                    )}
                </div>
              </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button 
                onClick={handleConfirmCashPayment} 
                disabled={isSubmitting || !selectedAccountId || !selectedPaymentDate || accounts.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
            >
                {isSubmitting ? <Loader2 className="mr-2 animate-spin" /> : <CheckCircle className="mr-2" />}ยืนยันข้อมูลและลงบัญชี
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!arDocToConfirm} onOpenChange={(open) => !open && setArDocToConfirm(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันรายการขายเครดิต?</AlertDialogTitle>
                  <AlertDialogDescription>
                      ต้องการยืนยันรายการลูกหนี้ค้างชำระ (Credit) สำหรับเอกสารเลขที่ {arDocToConfirm?.docNo} หรือไม่?
                      เมื่อยืนยันแล้ว <span className="font-bold text-destructive">จะเริ่มตั้งหนี้และไม่สามารถแก้ไขบิลได้อีก</span>
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={() => arDocToConfirm && handleCreateAR(arDocToConfirm)} disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} ยืนยันและตั้งหนี้
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

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
