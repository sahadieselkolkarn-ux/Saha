"use client";

import { useMemo, Suspense, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { doc } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useDoc } from "@/firebase/firestore/use-doc";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Printer, ExternalLink, Edit, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/date-utils";
import type { PurchaseDoc } from "@/lib/types";

// Helper for currency formatting
const formatCurrency = (value: number | null | undefined) => (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Status Badge Component
const getStatusVariant = (status?: PurchaseDoc['status']) => {
  switch (status) {
    case 'DRAFT': return 'secondary';
    case 'SUBMITTED': return 'outline';
    case 'APPROVED':
    case 'UNPAID':
    case 'PAID': return 'default';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

// UI component for the document view itself
function PurchaseDocView({ document }: { document: PurchaseDoc }) {
    return (
        <div className="printable-document p-8 border rounded-lg bg-card text-card-foreground shadow-sm print:shadow-none print:border-none">
            {/* Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-2">
                    <h2 className="text-xl font-bold">{document.vendorSnapshot.companyName}</h2>
                    <p className="text-sm text-muted-foreground">เลขที่บิล: {document.invoiceNo}</p>
                </div>
                <div className="space-y-2 text-left md:text-right">
                    <h1 className="text-2xl font-bold">บันทึกรายการซื้อ</h1>
                    <div className="flex md:justify-between text-sm"><span className="font-medium mr-2 md:mr-0">เลขที่เอกสาร:</span><span>{document.docNo}</span></div>
                    <div className="flex md:justify-between text-sm"><span className="font-medium mr-2 md:mr-0">วันที่:</span><span>{safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}</span></div>
                    <div className="flex md:justify-between text-sm items-center"><span className="font-medium mr-2 md:mr-0">สถานะ:</span><Badge variant={getStatusVariant(document.status)}>{document.status}</Badge></div>
                </div>
            </div>

            {/* Items Table */}
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
                            <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Summary and Photos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    {document.billPhotos && document.billPhotos.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-semibold">รูปบิลที่แนบ</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {document.billPhotos.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                        <Image src={url} alt={`Bill photo ${i+1}`} width={200} height={200} className="rounded-md object-cover w-full aspect-square hover:opacity-80 transition-opacity" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                    {document.note && <div className="space-y-1"><p className="font-semibold">หมายเหตุ:</p><p className="text-sm whitespace-pre-wrap">{document.note}</p></div>}
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between"><span>รวมเป็นเงิน</span><span>{formatCurrency(document.subtotal)}</span></div>
                    <div className="flex justify-between"><span>ส่วนลด</span><span>{formatCurrency(document.discountAmount)}</span></div>
                    <div className="flex justify-between font-medium"><span>ยอดหลังหักส่วนลด</span><span>{formatCurrency(document.net)}</span></div>
                    {document.withTax && <div className="flex justify-between"><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{formatCurrency(document.vatAmount)}</span></div>}
                    <Separator className="my-2" />
                    <div className="flex justify-between text-lg font-bold"><span>ยอดสุทธิ</span><span>{formatCurrency(document.grandTotal)}</span></div>
                </div>
            </div>
        </div>
    );
}

// Main page component
function PurchaseViewPageContent() {
    const { purchaseId } = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { db } = useFirebase();

    const docRef = useMemo(() => {
        if (!db || typeof purchaseId !== 'string') return null;
        return doc(db, 'purchaseDocs', purchaseId);
    }, [db, purchaseId]);

    const { data: document, isLoading, error } = useDoc<PurchaseDoc>(docRef);
    const printedRef = useRef(false);

    const isPrintMode = searchParams.get('print') === '1';
    const shouldAutoprint = searchParams.get('autoprint') === '1';
    
    useEffect(() => {
        if (isPrintMode && shouldAutoprint && document && !isLoading && !printedRef.current) {
            printedRef.current = true;
            const newUrl = `${pathname}?print=1`;
            router.replace(newUrl, { scroll: false });
            setTimeout(() => window.print(), 500);
        }
    }, [isPrintMode, shouldAutoprint, document, isLoading, router, pathname]);

    const handlePrint = () => {
        if (!isPrintMode) {
             router.push(`${pathname}?print=1&autoprint=1`);
        } else {
             window.print();
        }
    };

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
                <PageHeader title="Document Not Found" description="The requested purchase document does not exist." />
            </div>
        );
    }

    // In print mode, we only render the document itself. The layout is handled by app/app/layout.tsx
    if (isPrintMode) {
        return (
            <div>
                 <div className="print-hidden sticky top-0 bg-background/80 backdrop-blur-sm border-b p-2 flex items-center justify-center gap-4 text-sm z-50">
                    <p className="text-muted-foreground">โหมดพิมพ์: ถ้าไม่ขึ้นหน้าต่างพิมพ์ ให้กด ‘เปิดหน้าพิมพ์ในแท็บใหม่’ หรือกด Ctrl+P</p>
                    <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
                    <Button asChild variant="outline">
                        <a href={`${pathname}?print=1`} target="_blank" rel="noopener noreferrer"><ExternalLink/> เปิดหน้าพิมพ์ในแท็บใหม่</a>
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => router.replace(pathname)}>กลับ</Button>
                </div>
                <PurchaseDocView document={document} />
            </div>
        );
    }

    // Main view for non-print mode, with controls.
    return (
        <div className="space-y-6">
            <PageHeader title="รายละเอียดรายการซื้อ" />
             <div className="flex justify-between items-center">
                <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> กลับ</Button>
                <div className="flex gap-2">
                    {document.status === 'DRAFT' && (
                         <Button asChild variant="outline">
                           <a href={`/app/office/parts/purchases/new?editDocId=${document.id}`}><Edit/> แก้ไข</a>
                         </Button>
                    )}
                    <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
                </div>
            </div>
            
            <PurchaseDocView document={document} />
        </div>
    );
}

export default function PurchaseDocPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
      <PurchaseViewPageContent />
    </Suspense>
  )
}