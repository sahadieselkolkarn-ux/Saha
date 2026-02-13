"use client";

import { useMemo, Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { doc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Printer, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { safeFormat } from "@/lib/date-utils";
import type { Document } from "@/lib/types";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

function VehicleInfo({ doc }: { doc: Document }) {
    const s = doc.carSnapshot;
    if (!s || (!s.licensePlate && !s.brand && !s.model && !s.partNumber && !s.registrationNumber)) return null;

    return (
        <div className="space-y-1 text-sm border-l pl-6 print:pl-4 print:border-l-2 print:border-muted">
            <h4 className="font-semibold text-primary mb-2 uppercase tracking-wider text-xs">รายละเอียดรถ / ชิ้นส่วน</h4>
            {s.brand && <div className="flex justify-between gap-4"><span className="text-muted-foreground">ยี่ห้อ:</span><span className="font-medium">{s.brand}</span></div>}
            {s.model && <div className="flex justify-between gap-4"><span className="text-muted-foreground">รุ่นรถ:</span><span className="font-medium">{s.model}</span></div>}
            {s.licensePlate && <div className="flex justify-between gap-4"><span className="text-muted-foreground">ทะเบียน:</span><span className="font-medium">{s.licensePlate}</span></div>}
            {s.partNumber && <div className="flex justify-between gap-4"><span className="text-muted-foreground">เลขอะไหล่:</span><span className="font-medium">{s.partNumber}</span></div>}
            {s.registrationNumber && <div className="flex justify-between gap-4"><span className="text-muted-foreground">เลขทะเบียนชิ้นส่วน:</span><span className="font-medium">{s.registrationNumber}</span></div>}
        </div>
    );
}

function DocumentView({ document, taxCopyLabel }: { document: Document, taxCopyLabel?: 'ORIGINAL' | 'COPY' }) {
    const docTypeDisplay: Record<Document['docType'], string> = {
        QUOTATION: "ใบเสนอราคา / Quotation",
        DELIVERY_NOTE: "ใบส่งของชั่วคราว",
        TAX_INVOICE: "ใบกำกับภาษี / Tax Invoice",
        RECEIPT: "ใบเสร็จรับเงิน / Receipt",
        BILLING_NOTE: "ใบวางบิล / Billing Note",
        CREDIT_NOTE: "ใบลดหนี้ / Credit Note",
        WITHHOLDING_TAX: "หนังสือรับรองหัก ณ ที่จ่าย",
    };
    
    let finalDocTitle = docTypeDisplay[document.docType];
    if (document.docType === 'TAX_INVOICE') {
        if (taxCopyLabel === 'ORIGINAL') {
            finalDocTitle = "ใบกำกับภาษี ต้นฉบับ / Tax Invoice";
        } else if (taxCopyLabel === 'COPY') {
            finalDocTitle = "ใบกำกับภาษี สำเนา / Tax Invoice";
        }
    }

    const isDeliveryNote = document.docType === 'DELIVERY_NOTE';
    const isQuotation = document.docType === 'QUOTATION';

    const isTaxDoc =
        document.docType === 'TAX_INVOICE' ||
        document.docType === 'CREDIT_NOTE' ||
        document.docType === 'WITHHOLDING_TAX' ||
        (document.docType === 'RECEIPT' && !!document.customerSnapshot.useTax);

    const displayCustomerName = isTaxDoc
        ? document.customerSnapshot.taxName || document.customerSnapshot.name
        : document.customerSnapshot.name;
        
    const displayCustomerAddress = isTaxDoc
        ? document.customerSnapshot.taxAddress || 'ไม่มีข้อมูลที่อยู่'
        : (document.customerSnapshot.detail || document.customerSnapshot.taxAddress || 'ไม่มีข้อมูลที่อยู่');

    return (
        <div className="printable-document p-8 border rounded-lg bg-card text-card-foreground shadow-sm print:shadow-none print:border-none print:bg-white flex flex-col print:min-h-[277mm] print:pb-4">
            <div className="flex-1">
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
                        <h1 className="text-2xl font-bold text-right">{finalDocTitle}</h1>
                        <div className="flex justify-between text-sm"><span className="font-medium">เลขที่:</span><span>{document.docNo}</span></div>
                        <div className="flex justify-between text-sm"><span className="font-medium">วันที่:</span><span>{safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}</span></div>
                    </div>
                </div>

                <Card className="mb-8 print:bg-white print:shadow-none print:border-none">
                    <CardContent className="pt-6">
                        <div className={cn("grid grid-cols-1 gap-6", (isDeliveryNote || isQuotation) && "md:grid-cols-2")}>
                            <div className="space-y-1">
                                <h4 className="font-semibold text-base mb-2">ข้อมูลลูกค้า</h4>
                                <p className="font-bold">{displayCustomerName}</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{displayCustomerAddress}</p>
                                <p className="text-sm text-muted-foreground">โทร: {document.customerSnapshot.phone}</p>
                                {isTaxDoc && <p className="text-sm text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {document.customerSnapshot.taxId || 'N/A'}</p>}
                            </div>
                            {(isDeliveryNote || isQuotation) && (
                                <VehicleInfo doc={document} />
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Table className="mb-8">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead>รายการ</TableHead>
                            <TableHead className="text-right">จำนวน</TableHead>
                            <TableHead className="text-right">ราคา/หน่วย</TableHead>
                            <TableHead className="text-right">จำนวนเงิน</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {document.items.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell className="text-center">{index + 1}</TableCell>
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
                        <Separator className="my-2" />
                        <div className="flex justify-between text-lg font-bold"><span>ยอดสุทธิ</span><span>{document.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm print:mt-auto print:pt-6">
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
    );
}

function DocumentPageContent() {
    const { docId } = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { db } = useFirebase();

    const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
    const [printCopies, setPrintCopies] = useState<1 | 2>(1);

    const docRef = useMemo(() => {
        if (!db || typeof docId !== 'string') return null;
        return doc(db, 'documents', docId);
    }, [db, docId]);

    const { data: document, isLoading, error } = useDoc<Document>(docRef);
    const printedRef = useRef(false);

    const isPrintMode = searchParams.get('print') === '1';
    const shouldAutoprint = searchParams.get('autoprint') === '1';
    
    useEffect(() => {
        if (isPrintMode && shouldAutoprint && document && !isLoading && !printedRef.current) {
            printedRef.current = true;
            
            const newUrl = `${pathname}?print=1` + (searchParams.get('copies') ? `&copies=${searchParams.get('copies')}`: '');
            router.replace(newUrl, { scroll: false });

            setTimeout(() => {
                window.print();
            }, 500);
        }
    }, [isPrintMode, shouldAutoprint, document, isLoading, router, pathname, searchParams]);


    const handlePrint = () => {
        if (document?.docType === 'TAX_INVOICE' && !isPrintMode) {
            setIsPrintOptionsOpen(true);
        } else if (!isPrintMode) {
            router.push(`${pathname}?print=1&autoprint=1`);
        } else {
             window.print();
        }
    };
    
    const confirmPrint = () => {
        router.push(`${pathname}?print=1&autoprint=1&copies=${printCopies}`);
        setIsPrintOptionsOpen(false);
    };

    if (isLoading) {
        return <Skeleton className="h-screen w-full" />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-destructive">
                <AlertCircle className="w-16 h-16" />
                <PageHeader title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลเอกสารได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" />
            </div>
        );
    }
    
    if (!document) {
         return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <AlertCircle className="w-16 h-16 text-muted-foreground" />
                <PageHeader title="ไม่พบเอกสาร" description="เอกสารที่คุณต้องการเข้าถึงไม่มีอยู่ในระบบ หรือถูกลบไปแล้ว" />
            </div>
        );
    }

    if (isPrintMode) {
        const copies = Number(searchParams.get('copies') || '1') as 1 | 2;
        const isValidCopyCount = copies === 1 || copies === 2;

        if (document.docType === 'TAX_INVOICE') {
            return (
                <div>
                     <style jsx global>{`
                        @media print {
                            .page-break { page-break-after: always; }
                        }
                     `}</style>
                     <div className="print:hidden sticky top-0 bg-background/80 backdrop-blur-sm border-b p-2 flex items-center justify-center gap-4 text-sm z-50">
                        <p className="text-muted-foreground">โหมดพิมพ์: ถ้าไม่ขึ้นหน้าต่างพิมพ์ ให้กด ‘เปิดหน้าพิมพ์ในแท็บใหม่’ หรือกด Ctrl+P</p>
                        <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
                        <Button asChild variant="outline">
                            <a href={`${pathname}?print=1&copies=${copies}`} target="_blank" rel="noopener noreferrer"><ExternalLink/> เปิดหน้าพิมพ์ในแท็บใหม่</a>
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => router.replace(pathname)}>กลับ</Button>
                    </div>
                    <div className="print-pages">
                        <DocumentView document={document} taxCopyLabel="ORIGINAL" />
                        <div className="page-break" />
                        <DocumentView document={document} taxCopyLabel="COPY" />
                        {isValidCopyCount && copies === 2 && (
                            <>
                                <div className="page-break" />
                                <DocumentView document={document} taxCopyLabel="COPY" />
                            </>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div>
                 <div className="print:hidden sticky top-0 bg-background/80 backdrop-blur-sm border-b p-2 flex items-center justify-center gap-4 text-sm z-50">
                    <p className="text-muted-foreground">โหมดพิมพ์: ถ้าไม่ขึ้นหน้าต่างพิมพ์ ให้กด ‘เปิดหน้าพิมพ์ในแท็บใหม่’ หรือกด Ctrl+P</p>
                    <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
                    <Button asChild variant="outline">
                        <a href={`${pathname}?print=1`} target="_blank" rel="noopener noreferrer"><ExternalLink/> เปิดหน้าพิมพ์ในแท็บใหม่</a>
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => router.replace(pathname)}>กลับ</Button>
                </div>
                <DocumentView document={document} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> กลับ</Button>
                 <Button type="button" onClick={handlePrint}><Printer/> พิมพ์</Button>
            </div>
            
            <DocumentView document={document} />

            <AlertDialog open={isPrintOptionsOpen} onOpenChange={setIsPrintOptionsOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>เลือกรูปแบบการพิมพ์ใบกำกับภาษี</AlertDialogTitle>
                        <AlertDialogDescription>
                            กรุณาเลือกจำนวนสำเนาที่ต้องการพิมพ์เพื่อใช้ในการยื่นภาษีและเป็นหลักฐาน
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <RadioGroup value={String(printCopies)} onValueChange={(v) => setPrintCopies(Number(v) as 1 | 2)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="1" id="c1" />
                                <Label htmlFor="c1">ต้นฉบับ 1 ใบ + สำเนา 1 ใบ</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="2" id="c2" />
                                <Label htmlFor="c2">ต้นฉบับ 1 ใบ + สำเนา 2 ใบ (สำหรับออฟฟิศและบัญชี)</Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmPrint}>
                            พิมพ์
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function DocumentPageWrapper() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <DocumentPageContent />
    </Suspense>
  )
}
