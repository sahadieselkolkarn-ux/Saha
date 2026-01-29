
"use client";

import { useMemo, Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { AlertCircle, Printer, ExternalLink, Loader2 } from "lucide-react";
import { PayslipSlipView } from "@/components/payroll/PayslipSlipView";
import type { PayslipNew } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";


function PrintPayslipContent() {
    const { batchId } = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { db } = useFirebase();
    const { profile } = useAuth();
    
    const [payslip, setPayslip] = useState<WithId<PayslipNew> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const printedRef = useRef(false);
    const shouldAutoprint = searchParams.get('autoprint') === '1';

    useEffect(() => {
        if (!db || !profile?.uid || typeof batchId !== 'string') {
            setIsLoading(false);
            return;
        }

        const fetchPayslip = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const slipsCol = collection(db, "payrollBatches", batchId as string, "payslips");
                const q = query(slipsCol, where("userId", "==", profile.uid), limit(1));
                const snap = await getDocs(q);

                if (snap.empty) {
                    setPayslip(null);
                } else {
                    const slipDoc = snap.docs[0];
                    setPayslip({ id: slipDoc.id, ...slipDoc.data() } as WithId<PayslipNew>);
                }
            } catch (e: any) {
                setError(e);
                console.error("Failed to fetch payslip:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPayslip();
    }, [db, profile?.uid, batchId]);


    useEffect(() => {
        if (shouldAutoprint && payslip && !isLoading && !printedRef.current) {
            printedRef.current = true;
            const newUrl = `${pathname}?autoprint=0`;
            router.replace(newUrl, { scroll: false });
            setTimeout(() => {
                window.print();
            }, 500);
        }
    }, [shouldAutoprint, payslip, isLoading, router, pathname]);
    
    if (isLoading || !profile) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-12 w-12" /></div>;
    }
    
    if (error) {
        return <div className="p-8 text-center text-destructive"><AlertCircle className="mx-auto mb-2"/>Error: {error.message}</div>;
    }

    if (!payslip) {
        return <div className="p-8 text-center"><AlertCircle className="mx-auto mb-2"/>ไม่พบสลิปเงินเดือนสำหรับงวดนี้</div>;
    }
    
    return (
        <div>
            <div className="print:hidden sticky top-0 bg-background/80 backdrop-blur-sm border-b p-2 flex items-center justify-center gap-4 text-sm z-50">
                <p className="text-muted-foreground">โหมดพิมพ์: ถ้าไม่ขึ้นหน้าต่างพิมพ์ ให้กด Ctrl+P</p>
                <Button type="button" onClick={() => window.print()}><Printer/> พิมพ์</Button>
                <Button type="button" variant="ghost" onClick={() => window.close()}>กลับ</Button>
            </div>
            <main className="p-8 bg-white text-black">
                 <PayslipSlipView
                    userName={payslip.userName}
                    periodLabel={payslip.batchId}
                    snapshot={payslip.snapshot}
                    mode="read"
                    payType={undefined}
                />
            </main>
        </div>
    )
}

export default function PrintPayslipPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
            <PrintPayslipContent />
        </Suspense>
    )
}
