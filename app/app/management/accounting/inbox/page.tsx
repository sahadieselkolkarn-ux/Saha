"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase/client-provider";
import { collection, query, onSnapshot, where, doc, serverTimestamp, type FirestoreError, updateDoc, runTransaction, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
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
import { Loader2, Search, CheckCircle, Ban, HandCoins, MoreHorizontal, Eye, AlertCircle, ExternalLink, Calendar, Info, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WithId } from "@/firebase/firestore/use-collection";
import type { Document as DocumentType, AccountingAccount } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";
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
  const { db, firebaseApp } = useFirebase();
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
  const [closingJobId, setClosingJobId] = useState<string | null>(null);
  const [failedClosingJobId, setFailedClosingJobId] = useState<string | null>(null);

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [selectedPaymentDate, setSelectedPaymentDate] = useState("");
  
  const [arDocToConfirm, setArDocToConfirm] = useState<WithId<DocumentType> | null>(null);

  const hasPermission = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.role === 'MANAGER' || profile.department === 'MANAGEMENT' || profile.department === 'OFFICE';
  }, [profile]);

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
        return (doc.docType === 'DELIVERY_NOTE' || doc.docType === 'TAX_INVOICE') && (doc.paymentTerms === 'CASH' || !doc.paymentTerms);
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

  /**
   * Calls the Cloud Function via Firebase SDK (httpsCallable) to ensure CORS-safe calling.
   */
  const callCloseJobFunction = async (jobId: string) => {
    if (!firebaseApp) {
      console.error("Firebase App not initialized in context");
      return;
    }
    
    const functions = getFunctions(firebaseApp, 'us-central1');
    const closeJob = httpsCallable(functions, 'closeJobAfterAccounting');
    
    setClosingJobId(jobId);
    setFailedClosingJobId(null);
    
    try {
      const result: any = await closeJob({ jobId });
      if (result.data?.ok) {
        toast({ title: "ปิดงานสำเร็จ", description: "ใบงานถูกย้ายเข้าประวัติเรียบร้อยแล้ว" });
      } else {
        throw new Error(result.data?.error || result.data?.message || "Unknown error");
      }
    } catch (e: any) {
      console.error("Cloud Function call failed:", e);
      setFailedClosingJobId(jobId);
      toast({ 
        variant: "destructive", 
        title: "บันทึกบัญชีแล้ว แต่ย้ายเข้าประวัติไม่สำเร็จ", 
        description: "กรุณาลองกด 'ลองปิดงานอีกครั้ง' หรือแจ้งแอดมิน" 
      });
    } finally {
      setClosingJobId(null);
    }
  };

  const handleConfirmCashPayment = async () => {
    if (!db || !profile || !confirmingDoc || !selectedAccountId) return;
    
    setConfirmError(null);
    setIsSubmitting(true);
    
    const entryId = `SALE_${confirmingDoc.id}`;
    const arId = `AR_${confirmingDoc.id}`;
    const jobId = confirmingDoc.jobId;
    const closedDate = selectedPaymentDate;

    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'documents', confirmingDoc.id);
        const docSnap = await transaction.get(docRef);
        
        if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
        const docData = docSnap.data();
        
        if (docData.arStatus === 'PAID' || docData.status === 'PAID' || docData.accountingEntryId) {
          throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
        }

        const entryRef = doc(db, 'accountingEntries', entryId);
        const arRef = doc(db, 'accountingObligations', arId);
        const customerName = confirmingDoc.customerSnapshot?.name || 'Unknown';

        transaction.set(entryRef, {
          id: entryId,
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

        transaction.set(arRef, {
          id: arId,
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

      toast({ title: "ลงบัญชีรายรับสำเร็จ" });
      
      if (jobId) {
        callCloseJobFunction(jobId);
      }
      
      setConfirmingDoc(null);
      setIsSubmitting(false);
    } catch(e: any) {
      console.error("Confirm cash failed", e);
      setConfirmError(`บันทึกไม่สำเร็จ: ${e.message || e.toString()}`);
      setIsSubmitting(false);
    }
  };

  const handleCreateAR = async (docToProcess: WithId<DocumentType>) => {
    if (!db || !profile) return;
    setIsSubmitting(true);
    
    const arId = `AR_${docToProcess.id}`;
    const jobId = docToProcess.jobId;

    try {
        await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'documents', docToProcess.id);
            const docSnap = await transaction.get(docRef);
            
            if (!docSnap.exists()) throw new Error("ไม่พบเอกสารในระบบ");
            const docData = docSnap.data();
            
            if (docData.arStatus === 'UNPAID' || docData.status === 'UNPAID' || docData.arObligationId) {
                throw new Error("รายการนี้ถูกดำเนินการไปก่อนหน้านี้แล้ว");
            }

            const arRef = doc(db, 'accountingObligations', arId);
            const customerName = docToProcess.customerSnapshot?.name || 'Unknown';

            transaction.set(arRef, {
                id: arId,
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

            transaction.update(docRef, { 
                arStatus: 'UNPAID',
                status: 'UNPAID',
                arObligationId: arId,
                updatedAt: serverTimestamp()
            });
        });

        toast({ title: 'ตั้งลูกหนี้ค้างชำระสำเร็จ' });
        
        if (jobId) {
          callCloseJobFunction(jobId);
        }
        
        setArDocToConfirm(null);
        setIsSubmitting(false);
    } catch (e: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาดในการยืนยันรายการ", description: e.message });
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
      <PageHeader title="Inbox บัญชี (ตรวจสอบรายการขาย)" description="ตรวจสอบความถูกต้องของบิลเพื่อลงสมุดบัญชีรายวัน" />
      
      {failedClosingJobId && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>พบรายการปิดงานไม่สำเร็จ</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>ระบบบันทึกบัญชีแล้ว แต่ไม่สามารถย้ายงาน (ID: {failedClosingJobId.substring(0,8)}...) เข้าประวัติได้</span>
            <Button size="sm" variant="outline" onClick={() => callCloseJobFunction(failedClosingJobId)} disabled={!!closingJobId}>
              {closingJobId === failedClosingJobId ? <Loader2 className="animate-spin h-3 w-3 mr-1"/> : <RefreshCw className="h-3 w-3 mr-1"/>}
              ลองปิดงานอีกครั้ง
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {indexCreationUrl && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>ต้องสร้างดัชนี (Index) ก่อน</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>ฐานข้อมูลต้องการดัชนีเพื่อจัดเรียงข้อมูล กรุณากดปุ่มด้านล่างเพื่อสร้าง Index</span>
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> สร้าง Index
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
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>เอกสาร</TableHead>
                    <TableHead>ยอดเงิน</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredDocs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่มีรายการรอตรวจสอบ</TableCell></TableRow>
                  ) : filteredDocs.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                      <TableCell>{doc.customerSnapshot?.name || '--'}</TableCell>
                      <TableCell>
                        <div className="font-medium">{doc.docNo}</div>
                        <div className="text-xs text-muted-foreground">{doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'}</div>
                        {doc.jobId && <Badge variant="outline" className="text-[8px] h-4 mt-1 bg-blue-50">มี Job ผูกอยู่</Badge>}
                      </TableCell>
                      <TableCell className="font-bold text-primary">{formatCurrency(doc.grandTotal)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/app/office/documents/${doc.id}`)} title="ดูเอกสาร">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {closingJobId === doc.jobId ? (
                            <Badge variant="outline" className="animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin"/> ปิดจ๊อบ...</Badge>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleOpenConfirmDialog(doc)} className="text-green-600 focus:text-green-600 font-bold">
                                  <CheckCircle className="mr-2 h-4 w-4"/> ยืนยันรับเงิน
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setDisputingDoc(doc)} className="text-destructive focus:text-destructive">
                                  <Ban className="mr-2 h-4 w-4"/> ตีกลับให้แก้ไข
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="ar" className="mt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>เอกสาร</TableHead>
                    <TableHead>ยอดเงิน</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredDocs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-24">ไม่มีรายการรอตั้งลูกหนี้</TableCell></TableRow>
                  ) : filteredDocs.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>{safeFormat(new Date(doc.docDate), "dd/MM/yy")}</TableCell>
                      <TableCell>{doc.customerSnapshot?.name || '--'}</TableCell>
                      <TableCell>
                        <div className="font-medium">{doc.docNo}</div>
                        <div className="text-xs text-muted-foreground">{doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'}</div>
                        {doc.jobId && <Badge variant="outline" className="text-[8px] h-4 mt-1 bg-blue-50">มี Job ผูกอยู่</Badge>}
                      </TableCell>
                      <TableCell className="font-bold text-amber-600">{formatCurrency(doc.grandTotal)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/app/office/documents/${doc.id}`)} title="ดูเอกสาร">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {closingJobId === doc.jobId ? (
                            <Badge variant="outline" className="animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin"/> ปิดจ๊อบ...</Badge>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setArDocToConfirm(doc)} disabled={isSubmitting} className="font-bold text-amber-600 focus:text-amber-600">
                                  <HandCoins className="mr-2 h-4 w-4"/> ยืนยันตั้งลูกหนี้
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setDisputingDoc(doc)} className="text-destructive focus:text-destructive">
                                  <Ban className="mr-2 h-4 w-4"/> ตีกลับให้แก้ไข
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
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
                บันทึกรายรับเข้าสมุดบัญชีรายวัน
            </DialogDescription>
          </DialogHeader>
          
          {confirmError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>บันทึกไม่สำเร็จ</AlertTitle>
              <AlertDescription className="text-xs">{confirmError}</AlertDescription>
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
                        <Input type="date" value={selectedPaymentDate} onChange={(e) => setSelectedPaymentDate(e.target.value)} disabled={isSubmitting} />
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
                    <Label htmlFor="account">เข้าบัญชีที่รับเงิน</Label>
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
                </div>
              </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmingDoc(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button onClick={handleConfirmCashPayment} disabled={isSubmitting || !selectedAccountId || !selectedPaymentDate || accounts.length === 0} className="bg-green-600 hover:bg-green-700 text-white min-w-[180px]">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 animate-spin h-4 w-4" />
                    กำลังลงบัญชี...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    ยืนยันและลงบัญชี
                  </>
                )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!arDocToConfirm} onOpenChange={(open) => !open && setArDocToConfirm(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันรายการขายเครดิต?</AlertDialogTitle>
                  <AlertDialogDescription>
                      ต้องการยืนยันรายการลูกหนี้ค้างชำระสำหรับเอกสารเลขที่ {arDocToConfirm?.docNo} หรือไม่?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={() => arDocToConfirm && handleCreateAR(arDocToConfirm)} disabled={isSubmitting} className="min-w-[150px]">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <HandCoins className="mr-2 h-4 w-4" />}
                      {isSubmitting ? "กำลังบันทึก..." : "ยืนยันและตั้งหนี้"}
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
            <Label htmlFor="reason">ระบุเหตุผลที่ไม่ถูกต้อง</Label>
            <Textarea id="reason" placeholder="เช่น ยอดเงินไม่ตรง, เลือกประเภทลูกค้าผิด..." value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
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
