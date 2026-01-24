
"use client";

import { useMemo, Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Printer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { safeFormat } from "@/lib/date-utils";
import type { Document } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

function DocumentView({ document, isPrintMode }: { document: Document; isPrintMode: boolean }) {
    const router = useRouter();
    const { toast } = useToast();

    const handlePrint = () => {
        try {
            // Defensively remove styles that might prevent interaction.
            document?.documentElement?.classList.remove('prevent-scroll');
            if (document?.body?.style) {
                 document.body.style.pointerEvents = '';
            }
            
            const printUrl = window.location.href + (window.location.search ? '&' : '?') + 'print=1';
            // Added 'noopener,noreferrer' as requested for security.
            const printWindow = window.open(printUrl, '_blank', 'noopener,noreferrer');

            if (!printWindow) {
                toast({
                    variant: 'destructive',
                    title: 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้',
                    description: 'กรุณาอนุญาต pop-ups สำหรับเว็บไซต์นี้ แล้วลองใหม่อีกครั้ง',
                });
                window.print(); // Fallback to same-window print
            }
        } catch (error) {
            console.error("Print failed:", error);
            toast({
                variant: 'destructive',
                title: 'เกิดข้อผิดพลาดในการพิมพ์',
                description: 'กำลังลองพิมพ์ในหน้าต่างปัจจุบัน',
            });
            window.print(); // Fallback to same-window print
        }
    };

    const docTypeDisplay: Record<Document['docType'], string> = {
        QUOTATION: "ใบเสนอราคา / Quotation",
        DELIVERY_NOTE: "ใบส่งของชั่วคราว",
        TAX_INVOICE: "ใบกำกับภาษี / Tax Invoice",
        RECEIPT: "ใบเสร็จรับเงิน / Receipt",
        BILLING_NOTE: "ใบวางบิล / Billing Note",
        CREDIT_NOTE: "ใบลดหนี้ / Credit Note",
        WITHHOLDING_TAX: "หนังสือรับรองหัก ณ ที่จ่าย",
    };
    
    const isDeliveryNote = document.docType === 'DELIVERY_NOTE';

    return (
        <div className="space-y-6">
            {!isPrintMode && (
                <div className="flex justify-between items-center print:hidden">
                    <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> กลับ</Button>
                    <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
                </div>
            )}

            <div className="p-8 border rounded-lg bg-card text-card-foreground shadow-sm print:shadow-none print:border-none">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2 space-y-2">
                        {isDeliveryNote ? (
                             <>
                                <h2 className="text-xl font-bold">{document.storeSnapshot.informalName || document.storeSnapshot.taxName}</h2>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{document.storeSnapshot.taxAddress}</p>
                                <p className="text-sm text-muted-foreground">โทร: {document.storeSnapshot.phone}</p>
                            </>
                        ) : (
                             <>
                                <h2 className="text-xl font-bold">{document.storeSnapshot.taxName}</h2>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{document.storeSnapshot.taxAddress}</p>
                                <p className="text-sm text-muted-foreground">โทร: {document.storeSnapshot.phone}</p>
                                <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {document.storeSnapshot.taxId}</p>
                            </>
                        )}
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold text-right">{docTypeDisplay[document.docType]}</h1>
                        <div className="flex justify-between text-sm"><span className="font-medium">เลขที่:</span><span>{document.docNo}</span></div>
                        <div className="flex justify-between text-sm"><span className="font-medium">วันที่:</span><span>{safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}</span></div>
                    </div>
                </div>

                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="text-base">ข้อมูลลูกค้า</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                        <p className="font-semibold">{document.customerSnapshot.name}</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{document.customerSnapshot.taxAddress || 'N/A'}</p>
                        <p className="text-muted-foreground">โทร: {document.customerSnapshot.phone}</p>
                        {!isDeliveryNote && <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {document.customerSnapshot.taxId || 'N/A'}</p>}
                    </CardContent>
                </Card>

                <Table className="mb-8">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>รายการ</TableHead>
                            <TableHead className="text-right">จำนวน</TableHead>
                            <TableHead className="text-right">ราคา/หน่วย</TableHead>
                            <TableHead className="text-right">จำนวนเงิน</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {document.items.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{item.description}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">{item.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right">{item.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        {document.notes && <div className="space-y-1"><p className="font-semibold">หมายเหตุ:</p><p className="text-sm whitespace-pre-wrap">{document.notes}</p></div>}
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{document.subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">ส่วนลด</span><span>{document.discountAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{document.net.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                        {document.withTax && <div className="flex justify-between"><span className="text-muted-foreground">ภาษีมูลค่าเพิ่ม 7%</span><span>{document.vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>}
                        <Separator />
                        <div className="flex justify-between text-lg font-bold"><span>ยอดสุทธิ</span><span>{document.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                    </div>
                </div>
                
                 <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
                    <div className="space-y-16">
                        <p>.................................................</p>
                        <p>({document.senderName || 'ผู้ส่งสินค้า/บริการ'})</p>
                    </div>
                     <div className="space-y-16">
                        <p>.................................................</p>
                        <p>({document.receiverName || 'ผู้รับสินค้า/บริการ'})</p>
                    </div>
                </div>

            </div>
        </div>
    );
}

function DocumentPageContent() {
    const { docId } = useParams();
    const searchParams = useSearchParams();
    const { db } = useFirebase();

    const isPrintMode = searchParams.get('print') === '1';

    const docRef = useMemo(() => {
        if (!db || typeof docId !== 'string') return null;
        return doc(db, 'documents', docId);
    }, [db, docId]);

    const { data: document, isLoading, error } = useDoc<Document>(docRef);

    useEffect(() => {
        if (isPrintMode && document && !isLoading) {
            const handleAfterPrint = () => window.close();
            window.addEventListener('afterprint', handleAfterPrint);

            const timer = setTimeout(() => {
                window.print();
            }, 300);

            return () => {
                clearTimeout(timer);
                window.removeEventListener('afterprint', handleAfterPrint);
            }
        }
    }, [isPrintMode, document, isLoading]);

    if (isLoading) {
        return <Skeleton className="h-screen w-full" />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-destructive">
                <AlertCircle className="w-16 h-16" />
                <PageHeader title="Error Loading Document" description={error.message} />
            </div>
        );
    }
    
    if (!document) {
         return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <AlertCircle className="w-16 h-16 text-muted-foreground" />
                <PageHeader title="Document Not Found" description="The requested document does not exist." />
            </div>
        );
    }

    return <DocumentView document={document} isPrintMode={isPrintMode} />;
}

export default function DocumentPageWrapper() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <DocumentPageContent />
    </Suspense>
  )
}
