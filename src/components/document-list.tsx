
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, type FirestoreError, doc, updateDoc, serverTimestamp, deleteDoc, writeBatch } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle, MoreHorizontal, XCircle, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { safeFormat } from '@/lib/date-utils';
import type { Document, DocType } from "@/lib/types";

interface DocumentListProps {
  docType: DocType;
}

export function DocumentList({ docType }: DocumentListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const { profile } = useAuth();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [docToAction, setDocToAction] = useState<Document | null>(null);
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  const isUserAdmin = profile?.role === 'ADMIN';

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    const q = query(
      collection(db, "documents"),
      where("docType", "==", docType)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
      docsData.sort((a, b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime());
      setDocuments(docsData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setLoading(false);
      toast({ variant: "destructive", title: "Error loading documents." });
    });

    return () => unsubscribe();
  }, [db, docType, toast]);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    const lowercasedTerm = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.docNo.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.name?.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.phone?.includes(lowercasedTerm) ||
      doc.jobId?.toLowerCase().includes(lowercasedTerm) ||
      doc.carSnapshot?.licensePlate?.toLowerCase().includes(lowercasedTerm)
    );
  }, [documents, searchTerm]);

  const handleCancelRequest = (doc: Document) => {
    setDocToAction(doc);
    setIsCancelAlertOpen(true);
  };
  
  const handleDeleteRequest = (doc: Document) => {
    setDocToAction(doc);
    setIsDeleteAlertOpen(true);
  };

  const confirmCancel = async () => {
    if (!db || !docToAction || !profile) return;
    setIsActionLoading(true);
    try {
      const batch = writeBatch(db);

      // 1. Update the document status to CANCELLED
      const docRef = doc(db, "documents", docToAction.id);
      batch.update(docRef, {
        status: 'CANCELLED',
        updatedAt: serverTimestamp(),
      });

      // 2. If there's a linked job, revert its status to DONE
      if (docToAction.jobId && typeof docToAction.jobId === 'string' && docToAction.jobId.length > 0) {
        const jobRef = doc(db, "jobs", docToAction.jobId);
        batch.update(jobRef, {
          status: 'DONE',
          lastActivityAt: serverTimestamp(),
        });
        
        const activityRef = doc(collection(db, "jobs", docToAction.jobId, "activities"));
        batch.set(activityRef, {
            text: `ยกเลิกเอกสาร ${docToAction.docNo} สถานะงานกลับไปเป็น "งานเรียบร้อย"`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });
      }
      
      await batch.commit();

      toast({ title: "Document Cancelled", description: docToAction.jobId ? "Job status has been reverted to 'DONE'." : "" });

    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed", description: e.message });
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
      toast({ title: "Document Deleted" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed", description: e.message });
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by doc #, customer, phone, car plate, or job ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin h-8 w-8" /></div>
          ) : error ? (
            <div className="text-center text-destructive flex flex-col items-center gap-2 h-48 justify-center">
              <AlertCircle />
              <p>Error loading documents.</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length > 0 ? filteredDocuments.map(docItem => (
                    <TableRow
                      key={docItem.id}
                      onClick={() => router.push(`/app/office/documents/${docItem.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{docItem.docNo}</TableCell>
                      <TableCell>{safeFormat(new Date(docItem.docDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{docItem.customerSnapshot.name}</TableCell>
                      <TableCell><Badge variant={docItem.status === 'CANCELLED' ? 'outline' : docItem.status === 'PAID' ? 'default' : 'secondary'}>{docItem.status}</Badge></TableCell>
                      <TableCell className="text-right">{docItem.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                             <DropdownMenuItem onSelect={() => router.push(`/app/office/documents/${docItem.id}`)}>
                              แก้ไข
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleCancelRequest(docItem)} disabled={docItem.status === 'CANCELLED'}>
                              <XCircle className="mr-2 h-4 w-4"/>
                              ยกเลิก
                            </DropdownMenuItem>
                            {isUserAdmin && (
                              <DropdownMenuItem
                                onSelect={() => handleDeleteRequest(docItem)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                ลบ
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">
                        {searchTerm ? "No documents match your search." : "No documents found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการยกเลิก</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการยกเลิกเอกสารเลขที่ {docToAction?.docNo} ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>Close</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Cancel'}
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
            <AlertDialogCancel disabled={isActionLoading}>Close</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
