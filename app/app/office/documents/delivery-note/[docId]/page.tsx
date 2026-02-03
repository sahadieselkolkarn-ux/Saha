"use client";

import { useMemo, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useDoc } from "@/firebase/firestore/use-doc";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Printer, Edit, Ban, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/date-utils";
import type { Document } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function DeliveryNoteDetailPageContent() {
    const { docId } = useParams();
    const router = useRouter();
    const { db } = useFirebase();
    const { profile } = useAuth();
    const { toast } = useToast();
    const [isActionLoading, setIsActionLoading] = useState(false);

    const docRef = useMemo(() => (db && typeof docId === 'string' ? doc(db, 'documents', docId) : null), [db, docId]);
    const { data: document, isLoading, error } = useDoc<Document>(docRef);

    const isAdmin = profile?.role === 'ADMIN';
    
    const isValidType = document?.docType === 'DELIVERY_NOTE';
    const isCancelled = document?.status === 'CANCELLED';

    const handleCancel = async () => {
        if (!db || !docId) return;
        setIsActionLoading(true);
        try {
            await updateDoc(doc(db, 'documents', docId as string), {
                status: 'CANCELLED',
                updatedAt: serverTimestamp(),
                notes: (document?.notes || "") + "\n[System] ผู้ใช้ยกเลิกเอกสาร"
            });
            toast({ title: "ยกเลิกใบส่งของชั่วคราวสำเร็จ" });
        } catch (e: any) {
            toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!db || !docId || !isAdmin) return;
        setIsActionLoading(true);
        try {
            await deleteDoc(doc(db, 'documents', docId as string));
            toast({ title: "ลบเอกสารสำเร็จ" });
            router.push('/app/office/documents/delivery-note');
        } catch (e: any) {
            toast({ variant: 'destructive', title: "ลบไม่สำเร็จ", description: e.message });
            setIsActionLoading(false);
        }
    };

    if (isLoading) return <Skeleton className="h-screen w-full" />;
    
    if (error || !document || !isValidType) {
        return (
            <div className="p-8 text-center space-y-4">
                <AlertCircle className="mx-auto h-12 w-12 text-destructive"/>
                <h2 className="text-xl font-bold">ไม่พบข้อมูลใบส่งของชั่วคราว</h2>
                <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
                <div className="flex flex-wrap gap-2">
                    {isAdmin && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={isActionLoading}><Trash2 className="mr-2 h-4 w-4"/> ลบ</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>ยืนยันการลบแบบถาวร?</AlertDialogTitle>
                                    <AlertDialogDescription>การกระทำนี้จะลบข้อมูลออกจากฐานข้อมูลทันทีและไม่สามารถกู้คืนได้ เฉพาะผู้ดูแลระบบเท่านั้นที่ทำได้</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">ยืนยันการลบ</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    {!isCancelled && (
                        <>
                            <Button variant="outline" size="sm" onClick={() => router.push(`/app/office/documents/delivery-note/new?editDocId=${docId}`)}>
                                <Edit className="mr-2 h-4 w-4"/> แก้ไข
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" disabled={isActionLoading}><Ban className="mr-2 h-4 w-4"/> ยกเลิกเอกสาร</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>ยืนยันการยกเลิก?</AlertDialogTitle>
                                        <AlertDialogDescription>เอกสารที่ยกเลิกแล้วจะไม่สามารถแก้ไขได้อีก แต่จะยังคงอยู่ในระบบเพื่อการตรวจสอบ</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>ปิด</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCancel}>
                                            {isActionLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                                            ยืนยัน
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </>
                    )}
                    <Button variant="default" size="sm" onClick={() => router.push(`/app/office/documents/${docId}?print=1&autoprint=1`)}>
                        <Printer className="mr-2 h-4 w-4"/> พิมพ์
                    </Button>
                </div>
            </div>

            {isCancelled && (
                <Alert variant="destructive" className="print:hidden">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>เอกสารนี้ถูกยกเลิกแล้ว</AlertTitle>
                    <AlertDescription>ยกเลิกเมื่อวันที่: {safeFormat(document.updatedAt, 'PPpp')}</AlertDescription>
                </Alert>
            )}

            <Card className="print:shadow-none print:border-none">
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle className="text-2xl">ใบส่งของชั่วคราว / Delivery Note</CardTitle>
                        <CardDescription>เลขที่: {document.docNo} | วันที่: {safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}</CardDescription>
                    </div>
                    <Badge variant={isCancelled ? 'destructive' : 'default'}>
                        {isCancelled ? 'ยกเลิกแล้ว' : (document.status === 'PAID' ? 'จ่ายแล้ว' : 'ปกติ')}
                    </Badge>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p className="mb-4">กรุณาใช้หน้า "พิมพ์" เพื่อดูรูปแบบเอกสารฉบับเต็มสำหรับการส่งให้ลูกค้า</p>
                        <Button variant="outline" onClick={() => router.push(`/app/office/documents/${docId}`)}>
                            เปิดหน้าพรีวิวมาตรฐาน
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function DeliveryNoteDetailPage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <DeliveryNoteDetailPageContent />
        </Suspense>
    );
}
