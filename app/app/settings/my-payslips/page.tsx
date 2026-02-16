"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { collection, getDocs, getDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase, useDoc } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, MessageSquareWarning, Printer } from "lucide-react";
import type { PayslipNew, StoreSettings } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";
import { newPayslipStatusLabel, deptLabel, payTypeLabel } from "@/lib/ui-labels";
import { PayslipSlipDrawer } from "@/components/payroll/PayslipSlipDrawer";
import { PayslipSlipView, calcTotals } from "@/components/payroll/PayslipSlipView";

const formatCurrency = (value: number | undefined) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getStatusBadgeVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'DRAFT': return 'secondary';
        case 'SENT_TO_EMPLOYEE': return 'default';
        case 'REVISION_REQUESTED': return 'destructive';
        case 'READY_TO_PAY': return 'outline';
        case 'PAID': return 'default';
        default: return 'outline';
    }
};

function RevisionDialog({
  payslip,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting
}: {
  payslip: WithId<PayslipNew>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!reason.trim()) {
      return;
    }
    onSubmit(reason);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ร้องขอแก้ไขสลิปเงินเดือน</DialogTitle>
          <DialogDescription>
            สำหรับงวด: {payslip.batchId}. กรุณาระบุเหตุผลที่ต้องการแก้ไขให้ชัดเจน
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="กรุณากรอกเหตุผลที่นี่..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={!reason.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 animate-spin" />}
            ส่งคำร้อง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyPayslipsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  
  const [payslips, setPayslips] = useState<(WithId<PayslipNew> & { refPath: string })[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [revisionPayslip, setRevisionPayslip] = useState<WithId<PayslipNew> & { refPath: string } | null>(null);
  const [viewPayslip, setViewPayslip] = useState<(WithId<PayslipNew> & { refPath: string }) | null>(null);

  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const { data: storeSettings } = useDoc<StoreSettings>(storeSettingsRef);

  useEffect(() => {
    if (!db || !profile?.uid) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPayslips() {
      try {
        setLoading(true);
        const batchesSnap = await getDocs(collection(db, "payrollBatches"));
        const batchIds = batchesSnap.docs.map(d => d.id);
        batchIds.sort((a,b) => b.localeCompare(a));

        const results: (WithId<PayslipNew> & { refPath: string })[] = [];

        await Promise.all(batchIds.map(async (batchId) => {
          const slipRef = doc(db, "payrollBatches", batchId, "payslips", profile!.uid);
          const slipSnap = await getDoc(slipRef);
          if (slipSnap.exists()) {
            results.push({
              id: slipSnap.id,
              refPath: slipRef.path,
              ...(slipSnap.data() as PayslipNew),
            } as any);
          }
        }));

        results.sort((a, b) => {
          const dateA = a.sentAt?.toDate()?.getTime() || a.updatedAt?.toDate()?.getTime() || 0;
          const dateB = b.sentAt?.toDate()?.getTime() || b.updatedAt?.toDate()?.getTime() || 0;
          return dateB - dateA;
        });

        if (!cancelled) setPayslips(results);
      } catch (error: any) {
        console.error("Error fetching payslips:", error);
        toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลได้", description: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPayslips();
    return () => { cancelled = true; };
  }, [db, profile?.uid, toast]);


  const handleAccept = async (payslip: WithId<PayslipNew> & { refPath: string }) => {
    if (!db) return;
    setActioningId(payslip.id);
    try {
      const payslipRef = doc(db, payslip.refPath);
      await updateDoc(payslipRef, {
        status: 'READY_TO_PAY',
        employeeAcceptedAt: serverTimestamp(),
        employeeNote: null,
      });
      toast({ title: 'ยืนยันสลิปเรียบร้อย' });
      setPayslips(prev => prev.map(p => p.id === payslip.id ? {...p, status: 'READY_TO_PAY'} : p));
      setViewPayslip(prev => prev ? {...prev, status: 'READY_TO_PAY'} : null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ทำรายการไม่สำเร็จ', description: error.message });
    } finally {
      setActioningId(null);
    }
  };
  
  const handleRequestRevision = async (reason: string) => {
    if (!db || !revisionPayslip) return;
    setActioningId(revisionPayslip.id);
    try {
      const payslipRef = doc(db, revisionPayslip.refPath);
      await updateDoc(payslipRef, {
        status: 'REVISION_REQUESTED',
        employeeNote: reason,
      });
      toast({ title: 'ส่งคำร้องแก้ไขเรียบร้อย' });
      setPayslips(prev => prev.map(p => p.id === revisionPayslip.id ? {...p, status: 'REVISION_REQUESTED'} : p));
      setViewPayslip(null);
      setRevisionPayslip(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ทำรายการไม่สำเร็จ', description: error.message });
    } finally {
      setActioningId(null);
    }
  };

  const handleView = (payslip: WithId<PayslipNew> & { refPath: string }) => {
    setViewPayslip(payslip);
  };

  const handlePrintInDrawer = () => {
    if (!viewPayslip || !storeSettings || !profile) return;
    
    try {
      const frame = printFrameRef.current;
      if (!frame) return;
  
      const totals = calcTotals(viewPayslip.snapshot);
      
      const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Payslip ${viewPayslip.userName}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.5; color: #333; margin: 0; padding: 0; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 20px; color: #000; }
          .header p { margin: 5px 0 0; font-size: 12px; color: #666; }
          .doc-title { text-align: center; margin-bottom: 20px; }
          .doc-title h2 { margin: 0; font-size: 18px; text-decoration: underline; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
          .section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f9f9f9; }
          .text-right { text-align: right; }
          .total-row { font-weight: bold; background-color: #eee; }
          .footer { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; text-align: center; }
          .signature { border-top: 1px solid #333; padding-top: 5px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${storeSettings.taxName || 'ห้างหุ้นส่วนจำกัด สหดีเซลกลการ'}</h1>
          <p>${storeSettings.taxAddress || ''}</p>
          <p>โทร: ${storeSettings.phone || ''}</p>
        </div>
        <div class="doc-title">
          <h2>ใบแจ้งยอดเงินเดือน / PAY SLIP</h2>
        </div>
        <div class="info-grid">
          <div><strong>ชื่อพนักงาน:</strong> ${viewPayslip.userName}</div>
          <div class="text-right"><strong>ประจำงวด:</strong> ${viewPayslip.batchId}</div>
          <div><strong>แผนก:</strong> ${deptLabel(profile.department)}</div>
          <div class="text-right"><strong>ประเภท:</strong> ${payTypeLabel(profile.hr?.payType)}</div>
        </div>
        
        <div class="section-title">รายได้ / Earnings</div>
        <table>
          <thead><tr><th>รายการ</th><th class="text-right">จำนวนเงิน (บาท)</th></tr></thead>
          <tbody>
            <tr><td>เงินเดือนพื้นฐาน / Base Salary (งวด)</td><td class="text-right">${formatCurrency(totals.basePay)}</td></tr>
            ${(viewPayslip.snapshot.additions || []).map(a => `<tr><td>${a.name}</td><td class="text-right">${formatCurrency(a.amount)}</td></tr>`).join('')}
            <tr class="total-row"><td>รวมรายได้ / Total Earnings</td><td class="text-right">${formatCurrency(totals.basePay + totals.addTotal)}</td></tr>
          </tbody>
        </table>

        <div class="section-title">รายการหัก / Deductions</div>
        <table>
          <thead><tr><th>รายการ</th><th class="text-right">จำนวนเงิน (บาท)</th></tr></thead>
          <tbody>
            ${(viewPayslip.snapshot.deductions || []).map(d => `<tr><td>${d.name}</td><td class="text-right">${formatCurrency(d.amount)}</td></tr>`).join('') || '<tr><td>-</td><td class="text-right">0.00</td></tr>'}
            <tr class="total-row"><td>รวมรายการหัก / Total Deductions</td><td class="text-right">${formatCurrency(totals.dedTotal)}</td></tr>
          </tbody>
        </table>

        <div style="margin-top: 20px; padding: 10px; border: 2px solid #333; text-align: right; font-size: 18px; font-weight: bold;">
          เงินได้สุทธิ / NET PAY: <span style="margin-left: 20px;">${formatCurrency(totals.netPay)} บาท</span>
        </div>

        <div class="footer">
          <div>
            <div class="signature"></div>
            <p>ผู้อนุมัติจ่าย / Authorized Signature</p>
          </div>
          <div>
            <div class="signature"></div>
            <p>ผู้รับเงิน / Employee Signature</p>
          </div>
        </div>
      </body>
      </html>`;
  
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      frame.srcdoc = html;
    } catch (e) {
      toast({ variant: 'destructive', title: 'ไม่สามารถพิมพ์ได้' });
    }
  };


  const getPaymentStatus = (status: string) => {
    if (status === 'READY_TO_PAY') return 'รอโอน';
    if (status === 'PAID') return 'จ่ายแล้ว';
    return '-';
  };

  return (
    <>
      <PageHeader title="ใบเงินเดือนของฉัน" description="ตรวจสอบสลิปเงินเดือนและกดยืนยัน" />
      <Card>
        <CardHeader>
          <CardTitle>ประวัติสลิปเงินเดือน</CardTitle>
          <CardDescription>
            แสดงรายการสลิปเงินเดือนล่าสุดของคุณ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>งวด</TableHead>
                <TableHead>เงินสุทธิ</TableHead>
                <TableHead>สถานะสลิป</TableHead>
                <TableHead>สถานะการจ่าย</TableHead>
                <TableHead className="text-right">การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto animate-spin" />
                  </TableCell>
                </TableRow>
              ) : payslips.length > 0 ? (
                payslips.map(p => (
                  <TableRow key={p.id + p.batchId}>
                    <TableCell>{p.batchId}</TableCell>
                    <TableCell>{formatCurrency(p.snapshot?.netPay)} บาท</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(p.status)}>{newPayslipStatusLabel(p.status)}</Badge>
                    </TableCell>
                    <TableCell>{getPaymentStatus(p.status)}</TableCell>
                    <TableCell className="text-right">
                       <Button size="sm" variant="outline" onClick={() => handleView(p)}>
                          ดู
                        </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    ยังไม่มีข้อมูลสลิปเงินเดือน
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {revisionPayslip && (
        <RevisionDialog
          payslip={revisionPayslip}
          isOpen={!!revisionPayslip}
          onClose={() => setRevisionPayslip(null)}
          onSubmit={handleRequestRevision}
          isSubmitting={actioningId === revisionPayslip.id}
        />
      )}

      {viewPayslip && (
        <PayslipSlipDrawer
          open={!!viewPayslip}
          onOpenChange={(open) => !open && setViewPayslip(null)}
          title="ดูสลิปเงินเดือน"
          description={`งวด: ${viewPayslip.batchId}`}
          onPrint={handlePrintInDrawer}
          footerActions={
            <div className="flex gap-2 justify-end w-full">
              <Button
                onClick={() => handleAccept(viewPayslip)}
                disabled={actioningId !== null || viewPayslip.status !== 'SENT_TO_EMPLOYEE'}
              >
                <CheckCircle/>
                ยอมรับ
              </Button>

              <Button
                variant="destructive"
                onClick={() => {
                    setViewPayslip(null);
                    setRevisionPayslip(viewPayslip);
                }}
                disabled={actioningId !== null || viewPayslip.status !== 'SENT_TO_EMPLOYEE'}
              >
                <MessageSquareWarning/>
                ร้องขอแก้ไข
              </Button>
            </div>
          }
        >
          <PayslipSlipView
            userName={viewPayslip.userName}
            periodLabel={viewPayslip.batchId}
            snapshot={viewPayslip.snapshot}
            mode="read"
            payType={undefined}
          />
        </PayslipSlipDrawer>
      )}
      <iframe ref={printFrameRef} className="hidden" title="Print Frame" />
    </>
  );
}
