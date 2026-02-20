"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, type FirestoreError, doc, updateDoc, serverTimestamp, deleteDoc, orderBy, type OrderByDirection, limit, getDoc, deleteField, setDoc } from "firebase/firestore";
import { useFirebase, useAuth } from "@/firebase";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle, MoreHorizontal, XCircle, Trash2, Edit, Eye, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { safeFormat } from '@/lib/date-utils';
import type { Document, DocType } from "@/lib/types";
import { docStatusLabel } from "@/lib/ui-labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DocumentListProps {
  docType: DocType;
  limit?: number;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
  baseContext?: 'office' | 'accounting';
}

const getDocDisplayStatus = (doc: Document): { key: string; label: string; description: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    const status = String(doc.status ?? "").toUpperCase();
    const label = docStatusLabel(status) || status;

    let description = "สถานะเอกสารปกติ";
    switch(status) {
        case "DRAFT": description = "ออฟฟิศกำลังจัดทำ ยังไม่ได้ส่งให้บัญชีตรวจสอบ"; break;
        case "PENDING_REVIEW": description = "ส่งเรื่องให้ฝ่ายบัญชีตรวจสอบรายการขายแล้ว"; break;
        case "REJECTED": description = "ฝ่ายบัญชีพบจุดที่ต้องแก้ไขและส่งกลับมาให้ออฟฟิศ"; break;
        case "APPROVED": description = "ฝ่ายบัญชีตรวจสอบข้อมูลเบื้องต้นถูกต้องแล้ว"; break;
        case "PAID": description = "บันทึกรับเงินเข้าสมุดบัญชีเรียบร้อยแล้ว"; break;
        case "CANCELLED": description = "เอกสารนี้ถูกยกเลิกการใช้งานแล้ว"; break;
        case "UNPAID": description = "เป็นรายการขายเชื่อ ยอดเงินยังคงค้างชำระในระบบ"; break;
        case "PARTIAL": description = "ได้รับเงินมาบางส่วนแล้ว ยอดที่เหลือยังค้างชำระ"; break;
    }

    if (status === "CANCELLED") return { key: "CANCELLED", label, description, variant: "destructive" };
    if (status === "PAID") return { key: "PAID", label, description, variant: "default" };
    if (status === "REJECTED") return { key: "REJECTED", label, description, variant: "destructive" };
    if (status === "PENDING_REVIEW") return { key: "PENDING_REVIEW", label, description, variant: "secondary" };
    if (status === "DRAFT") return { key: "DRAFT", label, description, variant: "outline" };

    return { key: status, label, description, variant: "outline" };
};

export function DocumentList({ 
  docType,
  limit: limitProp = 10,
  orderByField = 'docNo',
  orderByDirection = 'desc',
  baseContext = 'office'
}: DocumentListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const { profile } = useAuth();

  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  
  const [docToAction, setDocToAction] = useState<Document | null>(null);
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(0);

  const isUserAdmin = profile?.role === 'ADMIN';

  const stableQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "documents"), 
      where("docType", "==", docType),
      orderBy(orderByField, orderByDirection),
      limit(500)
    );
  }, [db, docType, orderByField, orderByDirection]);

  useEffect(() => {
    if (!stableQuery) return;
    
    setLoading(true);
    setIndexCreationUrl(null);
    const unsubscribe = onSnapshot(stableQuery, (snapshot) => {
        const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
        setAllDocuments(docsData);
        setLoading(false);
        setError(null);
    }, (err: FirestoreError) => {
        console.error("Error fetching documents: ", err);
        setError(err);
        if (err.message?.includes('requires an index')) {
            const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
            if (urlMatch) setIndexCreationUrl(urlMatch[0]);
        }
        setLoading(false);
    });

    return () => unsubscribe();
  }, [stableQuery]);

  const processedDocuments = useMemo(() => {
    let filtered = [...allDocuments];

    if (statusFilter !== "ALL") {
        filtered = filtered.filter(doc => getDocDisplayStatus(doc).key === statusFilter);
    }

    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(doc =>
        doc.docNo.toLowerCase().includes(lowercasedTerm) ||
        doc.customerSnapshot.name?.toLowerCase().includes(lowercasedTerm) ||
        doc.customerSnapshot.phone?.includes(lowercasedTerm) ||
        doc.jobId?.toLowerCase().includes(lowercasedTerm) ||
        doc.carSnapshot?.licensePlate?.toLowerCase().includes(lowercasedTerm)
      );
    }

    return filtered;
  }, [allDocuments, searchTerm, statusFilter]);
  
  const paginatedDocuments = useMemo(() => {
    const start = currentPage * limitProp;
    const end = start + limitProp;
    return processedDocuments.slice(start, end);
  }, [processedDocuments, currentPage, limitProp]);

  const totalPages = Math.max(1, Math.ceil(processedDocuments.length / limitProp));
  
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter]);

  const uniqueStatuses = useMemo(() => {
    const allStatuses = new Set(allDocuments.map(doc => getDocDisplayStatus(doc).key));
    return ["ALL", ...Array.from(allStatuses)];
  }, [allDocuments]);

  const handleCancelRequest = (doc: Document) => {
    setDocToAction(doc);
    setIsCancelAlertOpen(true);
  };
  
  const handleDeleteRequest = (doc: Document) => {
    setDocToAction(doc);
    setIsDeleteAlertOpen(true);
  };

  const confirmCancel = async () => {
    if (!db || !docToAction) return;
    setIsActionLoading(true);
    try {
      const docRef = doc(db, 'documents', docToAction.id);
      
      // 1. Update document status to CANCELLED
      await updateDoc(docRef, {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });

      // 2. Revert the Job state
      if (docToAction.jobId) {
        const jobRef = doc(db, 'jobs', docToAction.jobId);
        const jobSnap = await getDoc(jobRef);
        
        if (jobSnap.exists()) {
          // Reset Job status to DONE and clear ALL sales doc links
          await updateDoc(jobRef, {
            status: 'DONE',
            salesDocId: deleteField(),
            salesDocNo: deleteField(),
            salesDocType: deleteField(),
            lastActivityAt: serverTimestamp(),
          });

          // Log the reversion
          const activityRef = doc(collection(db, 'jobs', docToAction.jobId, 'activities'));
          await setDoc(activityRef, {
            text: `ยกเลิกเอกสาร ${docToAction.docNo}: ระบบย้อนสถานะใบงานกลับเป็น "งานเสร็จรอทำบิล" (DONE) เพื่อให้ออกบิลใหม่ได้`,
            userName: profile?.displayName || 'System',
            userId: profile?.uid || 'system',
            createdAt: serverTimestamp(),
          });
        }
      }

      toast({ title: "ยกเลิกเอกสารและย้อนสถานะใบงานสำเร็จ" });
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      toast({ variant: 'destructive', title: "ยกเลิกไม่สำเร็จ", description: err.message });
    } finally {
      setIsActionLoading(false);
      setIsCancelAlertOpen(false);
      setDocToAction(null);
    }
  };

  const confirmDelete = async () => {
    if (!db || !docToAction) return;
    setIsActionLoading(true);
    try {
      await deleteDoc(doc(db, 'documents', docToAction.id));
      toast({ title: "ลบเอกสารสำเร็จ" });
    } catch (err: any) {
      toast({ variant: 'destructive', title: "ลบไม่สำเร็จ", description: err.message });
    } finally {
      setIsActionLoading(false);
      setIsDeleteAlertOpen(false);
      setDocToAction(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          {indexCreationUrl && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>ต้องสร้างดัชนี (Index) ก่อน</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>ฐานข้อมูลต้องการดัชนีเพื่อเรียงลำดับเอกสาร กรุณากดปุ่มด้านล่างเพื่อสร้าง Index</span>
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> สร้าง Index ใน Firebase Console
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="ค้นหาบิล, ชื่อลูกค้า, ทะเบียนรถ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="กรองตามสถานะ..." /></SelectTrigger>
              <SelectContent>
                {uniqueStatuses.map(status => (
                    <SelectItem key={status} value={status}>{status === "ALL" ? "ทุกสถานะ" : docStatusLabel(status) || status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin h-8 w-8" /></div>
          ) : (
            <div className="border rounded-md">
              <TooltipProvider>
                <Table>
                  <TableHeader><TableRow><TableHead>เลขที่</TableHead><TableHead>วันที่</TableHead><TableHead>ลูกค้า</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">ยอดสุทธิ</TableHead><TableHead className="text-right w-[100px]">จัดการ</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {paginatedDocuments.length > 0 ? paginatedDocuments.map(docItem => {
                      const displayStatus = getDocDisplayStatus(docItem);
                      const viewPath = docItem.docType === 'DELIVERY_NOTE' ? `/app/office/documents/delivery-note/${docItem.id}` : (docItem.docType === 'TAX_INVOICE' ? `/app/office/documents/tax-invoice/${docItem.id}` : `/app/documents/${docItem.id}`);
                      const editPath = baseContext === 'office' && ['TAX_INVOICE', 'DELIVERY_NOTE', 'QUOTATION'].includes(docItem.docType) ? `/app/office/documents/${docItem.docType.toLowerCase().replace('_', '-')}/new?editDocId=${docItem.id}` : null;

                      return (
                      <TableRow key={docItem.id}>
                        <TableCell className="font-medium">{docItem.docNo}</TableCell>
                        <TableCell>{safeFormat(new Date(docItem.docDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{docItem.customerSnapshot.name}</TableCell>
                        <TableCell><Tooltip><TooltipTrigger asChild><Badge variant={displayStatus.variant} className="cursor-help">{displayStatus.label}</Badge></TooltipTrigger><TooltipContent><p>{displayStatus.description}</p></TooltipContent></Tooltip></TableCell>
                        <TableCell className="text-right">{docItem.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => router.push(viewPath)}><Eye className="mr-2 h-4 w-4"/> ดูรายละเอียด</DropdownMenuItem>
                              {editPath && <DropdownMenuItem onSelect={() => router.push(editPath)} disabled={docItem.status === 'PAID' && !isUserAdmin}> <Edit className="mr-2 h-4 w-4"/> แก้ไข</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleCancelRequest(docItem); }} disabled={docItem.status === 'CANCELLED' || (docItem.status === 'PAID' && !isUserAdmin)}> <XCircle className="mr-2 h-4 w-4"/> ยกเลิก</DropdownMenuItem>
                              {isUserAdmin && <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDeleteRequest(docItem); }} className="text-destructive focus:text-destructive"> <Trash2 className="mr-2 h-4 w-4" /> ลบ</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )}) : (
                      <TableRow><TableCell colSpan={6} className="text-center h-24">{searchTerm ? "ไม่พบเอกสารที่ตรงกับคำค้นหา" : "ไม่พบเอกสาร"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
         {totalPages > 1 && (
          <CardFooter>
            <div className="flex w-full justify-between items-center">
              <span className="text-sm text-muted-foreground">หน้า {currentPage + 1} จาก {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 0}><ChevronLeft className="h-4 w-4" /> ก่อนหน้า</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1}>ถัดไป <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการยกเลิกเอกสาร</AlertDialogTitle>
            <AlertDialogDescription>การยกเลิกนี้จะย้อนสถานะใบงานกลับไปเป็น "งานเสร็จรอทำบิล" เพื่อให้ออกบิลใหม่ได้ คุณต้องการดำเนินการต่อหรือไม่?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>ปิด</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการยกเลิก'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle><AlertDialogDescription>คุณต้องการลบเอกสารนี้อย่างถาวรใช่หรือไม่?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>ปิด</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการลบ'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
