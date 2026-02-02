
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, type FirestoreError, doc, updateDoc, serverTimestamp, deleteDoc, orderBy, type OrderByDirection, type QueryConstraint, getDocs, startAfter, type QueryDocumentSnapshot, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle, MoreHorizontal, XCircle, Trash2, Edit, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { safeFormat } from '@/lib/date-utils';
import type { Document, DocType } from "@/lib/types";
import { docStatusLabel } from "@/lib/ui-labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface DocumentListProps {
  docType: DocType;
  limit?: number;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
}

const getDocDisplayStatus = (doc: Document): { key: string; label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    const status = String(doc.status ?? "").toUpperCase();
    const hasRejectionInfo = doc.reviewRejectReason || doc.reviewRejectedAt || doc.reviewRejectedByName;

    if (status === "CANCELLED") return { key: "CANCELLED", label: "ยกเลิก", variant: "destructive" };
    if (status === "PAID") return { key: "PAID", label: "จ่ายแล้ว", variant: "default" };

    if (status === "REJECTED" || !!hasRejectionInfo) return { key: "REJECTED", label: "ตีกลับ", variant: "destructive" };
    
    if (status === "PENDING_REVIEW") return { key: "PENDING_REVIEW", label: "รอตรวจสอบรายรับ", variant: "secondary" };
    if (status === "DRAFT") return { key: "DRAFT", label: "ฉบับร่าง", variant: "outline" };

    // Fallback for any other status
    return { key: status, label: docStatusLabel(doc.status) || doc.status, variant: "outline" };
};


export function DocumentList({ 
  docType,
  limit: limitProp,
  orderByField,
  orderByDirection = 'desc'
}: DocumentListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const { profile } = useAuth();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  
  const [docToAction, setDocToAction] = useState<Document | null>(null);
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(0);
  const [pageStartCursors, setPageStartCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const isUserAdmin = profile?.role === 'ADMIN';

  const fetchData = useCallback(async () => {
    if (!db) return;

    setLoading(true);
    setError(null);

    try {
      const qConstraints: QueryConstraint[] = [where("docType", "==", docType)];

      if (orderByField) {
        qConstraints.push(orderBy(orderByField, orderByDirection));
      } else {
        qConstraints.push(orderBy("docDate", "desc"));
      }

      const cursor = pageStartCursors[currentPage];
      if (cursor) {
        qConstraints.push(startAfter(cursor));
      }

      if (limitProp) {
        qConstraints.push(limit(limitProp));
      }

      const finalQuery = query(collection(db, "documents"), ...qConstraints);
      const snapshot = await getDocs(finalQuery);

      let docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
      
      setDocuments(docsData);

      const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
      if (lastVisibleDoc && currentPage >= pageStartCursors.length - 1) {
          const newCursors = [...pageStartCursors];
          newCursors[currentPage + 1] = lastVisibleDoc;
          setPageStartCursors(newCursors);
      }
      
      setIsLastPage(snapshot.docs.length < (limitProp || 10));
    } catch (err: any) {
      setError(err);
      if (!err.message?.includes('requires an index')) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาดในการโหลดเอกสาร", description: err.code });
      }
    } finally {
      setLoading(false);
    }
  }, [db, docType, toast, currentPage, limitProp, orderByField, orderByDirection]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const uniqueStatuses = useMemo(() => {
    const allStatuses = new Set(documents.map(doc => getDocDisplayStatus(doc).key));
    return ["ALL", ...Array.from(allStatuses)];
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    if (statusFilter !== "ALL") {
        filtered = filtered.filter(doc => getDocDisplayStatus(doc).key === statusFilter);
    }

    if (!searchTerm) return filtered;
    const lowercasedTerm = searchTerm.toLowerCase();
    
    return filtered.filter(doc =>
      doc.docNo.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.name?.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.phone?.includes(lowercasedTerm) ||
      doc.jobId?.toLowerCase().includes(lowercasedTerm) ||
      doc.carSnapshot?.licensePlate?.toLowerCase().includes(lowercasedTerm)
    );
  }, [documents, searchTerm, statusFilter]);

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
      const docRef = doc(db, "documents", docToAction.id);
      await updateDoc(docRef, {
        status: 'CANCELLED',
        updatedAt: serverTimestamp(),
      });
      toast({ title: "ยกเลิกเอกสารสำเร็จ" });
      fetchData(); // Refetch data
    } catch (e: any) {
      toast({ variant: "destructive", title: "การยกเลิกล้มเหลว", description: e.message });
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
      await deleteDoc(doc(db, "documents", docToAction.id));
      toast({ title: "ลบเอกสารสำเร็จ" });
      fetchData(); // Refetch data
    } catch (e: any) {
      toast({ variant: "destructive", title: "การลบล้มเหลว", description: e.message });
    } finally {
      setIsActionLoading(false);
      setIsDeleteAlertOpen(false);
      setDocToAction(null);
    }
  };
  
  const handleNextPage = () => {
    if (!isLastPage) {
        setCurrentPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
      if (currentPage > 0) {
          setPageStartCursors(prev => prev.slice(0, currentPage));
          setCurrentPage(p => p - 1);
      }
  };


  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาจากเลขที่, ชื่อลูกค้า, เบอร์โทร, ทะเบียนรถ, หรือรหัสงาน..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status..." />
              </SelectTrigger>
              <SelectContent>
                {uniqueStatuses.map(status => (
                    <SelectItem key={status} value={status}>
                        {status === "ALL" ? "ทุกสถานะ" : docStatusLabel(status) || status}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin h-8 w-8" /></div>
          ) : error ? (
            <div className="text-center text-destructive flex flex-col items-center gap-2 h-48 justify-center">
              <AlertCircle />
              <p>เกิดข้อผิดพลาดในการโหลดเอกสาร</p>
              {error.message.includes('requires an index') ? (
                <p className="text-muted-foreground text-sm">การเรียงข้อมูลอาจไม่ถูกต้อง กรุณารีเฟรช</p>
              ) : <p className="text-xs">{error.message}</p>}
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">ยอดสุทธิ</TableHead>
                    <TableHead className="text-right w-[100px]">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length > 0 ? filteredDocuments.map(docItem => {
                    const viewPath = `/app/office/documents/${docItem.id}`;
                    
                    const editPath = docItem.docType === 'QUOTATION'
                        ? `/app/office/documents/quotation/${docItem.id}`
                        : `/app/office/documents/${docItem.docType.toLowerCase().replace('_', '-')}/new?editDocId=${docItem.id}`;

                    return (
                    <TableRow key={docItem.id}>
                      <TableCell className="font-medium">{docItem.docNo}</TableCell>
                      <TableCell>{safeFormat(new Date(docItem.docDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{docItem.customerSnapshot.name}</TableCell>
                      <TableCell>
                        {(() => {
                          const displayStatus = getDocDisplayStatus(docItem);
                          return (
                            <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">{docItem.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => router.push(viewPath)}>
                                <Eye className="mr-2 h-4 w-4"/>
                                ดู
                            </DropdownMenuItem>
                            {docItem.status === 'PAID' ? (
                                <DropdownMenuItem disabled>
                                    <Edit className="mr-2 h-4 w-4"/>
                                    แก้ไขไม่ได้ (บันทึกรายรับแล้ว)
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onSelect={() => router.push(editPath)}>
                                    <Edit className="mr-2 h-4 w-4"/>
                                    แก้ไข
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleCancelRequest(docItem); }} disabled={docItem.status === 'CANCELLED' || docItem.status === 'PAID'}>
                              <XCircle className="mr-2 h-4 w-4"/>
                              ยกเลิก
                            </DropdownMenuItem>
                            {isUserAdmin && (
                              <DropdownMenuItem
                                onSelect={(e) => { e.preventDefault(); handleDeleteRequest(docItem); }}
                                className="text-destructive focus:text-destructive"
                                disabled={docItem.status === 'PAID'}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                ลบ
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )}) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">
                        {searchTerm ? "ไม่พบเอกสารที่ตรงกับคำค้นหา" : "ไม่พบเอกสาร"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
         {limitProp && filteredDocuments.length > 0 && (
          <CardFooter>
            <div className="flex w-full justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Page {currentPage + 1}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={isLastPage || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการยกเลิก</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการยกเลิกเอกสารเลขที่ {docToAction?.docNo} ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>ปิด</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการยกเลิก'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบเอกสารเลขที่ {docToAction?.docNo} ใช่หรือไม่? การกระทำนี้จะลบข้อมูลอย่างถาวร
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>ปิด</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ยืนยันการลบ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
