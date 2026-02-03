
"use client";

import { useMemo, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Document as DocumentType } from "@/lib/types";

export default function WhtPrintPage() {
    const { docId } = useParams();
    const router = useRouter();
    const { db } = useFirebase();

    const docRef = useMemo(() => (db && typeof docId === 'string' ? doc(db, 'documents', docId) : null), [db, docId]);
    const { data: document, isLoading, error } = useDoc<DocumentType>(docRef);

    useEffect(() => {
        if (document && !isLoading) {
            const timer = setTimeout(() => {
                window.print();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [document, isLoading]);

    if (isLoading) return <Skeleton className="h-screen w-full" />;
    if (error || !document) return <div className="p-8 text-center text-destructive"><AlertCircle className="mx-auto mb-2"/><p>ไม่พบเอกสาร</p></div>;

    const taxIdPayer = (document.payerSnapshot?.taxId || '').replace(/\D/g, '').split('');
    const taxIdPayee = (document.payeeSnapshot?.taxId || '').replace(/\D/g, '').split('');

    return (
        <div className="relative w-[210mm] min-h-[297mm] mx-auto bg-white overflow-hidden print:m-0 print:w-full">
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    .print-hidden { display: none !important; }
                }
                .wht-form-bg {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-image: url('/forms/wht50twi.png');
                    background-size: contain;
                    background-repeat: no-repeat;
                    z-index: 0;
                }
                .field {
                    position: absolute;
                    font-size: 12px;
                    font-family: sans-serif;
                    z-index: 10;
                }
                .digit-box {
                    display: flex;
                    position: absolute;
                    gap: 14.5px;
                    z-index: 10;
                }
                .digit {
                    width: 15px;
                    text-align: center;
                    font-weight: bold;
                }
            `}</style>

            <div className="print-hidden sticky top-0 bg-background/80 backdrop-blur-sm border-b p-2 flex items-center justify-center gap-4 z-50">
                <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
                <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> พิมพ์</Button>
                <p className="text-xs text-muted-foreground">หากไม่เห็นแบบฟอร์ม กรุณาตรวจสอบว่ามีไฟล์ /forms/wht50twi.png ในเครื่อง</p>
            </div>

            <div className="wht-form-bg" />

            {/* เลขที่เล่ม/เลขที่ */}
            <div className="field" style={{ top: '42mm', left: '165mm' }}>{document.docNo}</div>

            {/* ผู้จ่ายเงิน (Payer) */}
            <div className="digit-box" style={{ top: '58mm', left: '128mm' }}>
                {taxIdPayer.map((d, i) => <span key={i} className="digit">{d}</span>)}
            </div>
            <div className="field" style={{ top: '65mm', left: '30mm' }}>{document.payerSnapshot?.name}</div>
            <div className="field" style={{ top: '72mm', left: '30mm', width: '150mm' }}>{document.payerSnapshot?.address}</div>

            {/* ผู้ถูกหัก (Payee) */}
            <div className="digit-box" style={{ top: '88mm', left: '128mm' }}>
                {taxIdPayee.map((d, i) => <span key={i} className="digit">{d}</span>)}
            </div>
            <div className="field" style={{ top: '95mm', left: '30mm' }}>{document.payeeSnapshot?.name}</div>
            <div className="field" style={{ top: '102mm', left: '30mm', width: '150mm' }}>{document.payeeSnapshot?.address}</div>

            {/* ลำดับที่ในแบบ (Assume PND53 for business) */}
            <div className="field" style={{ top: '118mm', left: '102mm' }}>/</div> {/* Checkbox PND53 */}

            {/* รายการเงินได้ (ITEM 5) */}
            <div className="field" style={{ top: '192mm', left: '30mm' }}>{safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}</div>
            <div className="field text-right" style={{ top: '192mm', left: '145mm', width: '30mm' }}>{document.paidAmountGross?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className="field text-right" style={{ top: '192mm', left: '178mm', width: '20mm' }}>{document.withholdingAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>

            {/* สรุปยอดรวม */}
            <div className="field text-right" style={{ top: '232mm', left: '145mm', width: '30mm' }}>{document.paidAmountGross?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className="field text-right" style={{ top: '232mm', left: '178mm', width: '20mm' }}>{document.withholdingAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>

            {/* ตัวอักษรยอดเงินหัก */}
            <div className="field font-bold" style={{ top: '240mm', left: '80mm' }}>(............................................................)</div>

            {/* ลายเซ็น */}
            <div className="field text-center" style={{ top: '270mm', left: '120mm', width: '60mm' }}>
                {document.senderName}
                <br/>
                {safeFormat(new Date(document.docDate), 'dd/MM/yyyy')}
            </div>
        </div>
    );
}
