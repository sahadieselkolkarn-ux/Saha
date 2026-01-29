
"use client";

import { useState, useEffect, useRef } from "react";
import { collection, getDocs, getDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
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
import type { PayslipNew } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { newPayslipStatusLabel } from "@/lib/ui-labels";
import { PayslipSlipDrawer } from "@/components/payroll/PayslipSlipDrawer";
import { PayslipSlipView, calcTotals } from "@/components/payroll/PayslipSlipView";

// Helper for currency formatting
const formatCurrency = (value: number | undefined) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper for status badge variant
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

// Component for the Revision Dialog
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

  useEffect(() => {
    if (!db || !profile?.uid) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPayslips() {
      try {
        setLoading(true);

        // 1) get payroll batch ids
        const batchesSnap = await getDocs(collection(db, "payrollBatches"));
        const batchIds = batchesSnap.docs.map(d => d.id);

        // sort latest first by id pattern "YYYY-MM-{period}"
        batchIds.sort((a,b) => b.localeCompare(a));

        // 2) read payslip doc for each batchId using profile.uid as doc id
        const results: (WithId<PayslipNew> & { refPath: string })[] = [];

        await Promise.all(batchIds.map(async (batchId) => {
          const slipRef = doc(db, "payrollBatches", batchId, "payslips", profile.uid);
          const slipSnap = await getDoc(slipRef);
          if (slipSnap.exists()) {
            results.push({
              id: slipSnap.id,
              refPath: slipRef.path,
              ...(slipSnap.data() as PayslipNew),
            } as any);
          }
        }));

        // 3) sort by sentAt/updatedAt desc (same logic as before)
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
      // Manually update local state for immediate feedback
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
       // Manually update local state
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

  function buildPayslipPrintHtml(p: WithId<PayslipNew>) {
    return `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Payslip ${p.batchId}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        html, body { background: #fff !important; color: #000; font-family: system-ui, -apple-system, "Segoe UI", Arial; }
        * { box-shadow: none !important; }
        .box { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
        h1,h2,h3 { margin: 0; }
        .muted { color: #444; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border-bottom: 1px solid #e5e5e5; padding: 6px 8px; font-size: 12px; }
        th { text-align: left; background: #fff; }
        .right { text-align: right; }
        .total { font-size: 14px; font-weight: 700; }
        .section { margin-top: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      </style>
    </head>
    <body>
      <div class="box">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h2>สลิปเงินเดือน</h2>
            <div class="muted">งวด: ${p.batchId}</div>
          </div>
          <div style="text-align:right">
            <div><b>${p.userName}</b></div>
          </div>
        </div>
  
        <div class="section box">
          <div style="display:flex; justify-content:space-between;">
            <div>ฐานเงินเดือน</div>
            <div class="right">${(p.snapshot?.basePay ?? 0).toLocaleString('th-TH',{minimumFractionDigits:2})}</div>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <div>รายรับเพิ่มเติม</div>
            <div class="right">${(p.snapshot?.additions ?? []).reduce((s,i)=>s+(i.amount||0),0).toLocaleString('th-TH',{minimumFractionDigits:2})}</div>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <div>รายการหัก</div>
            <div class="right">-${(p.snapshot?.deductions ?? []).reduce((s,i)=>s+(i.amount||0),0).toLocaleString('th-TH',{minimumFractionDigits:2})}</div>
          </div>
          <hr />
          <div style="display:flex; justify-content:space-between;" class="total">
            <div>ยอดสุทธิ</div>
            <div class="right">${(p.snapshot?.netPay ?? 0).toLocaleString('th-TH',{minimumFractionDigits:2})}</div>
          </div>
        </div>
  
        <div class="grid section">
          <div class="box">
            <b>สรุปการลงเวลา</b>
            <table>
              <tbody>
                <tr><td>วันทำงานตามตาราง</td><td class="right">${p.snapshot?.attendanceSummary?.scheduledWorkDays ?? '-'}</td></tr>
                <tr><td>วันทำงาน</td><td class="right">${p.snapshot?.attendanceSummary?.presentDays ?? '-'}</td></tr>
                <tr><td>วันมาสาย</td><td class="right">${p.snapshot?.attendanceSummary?.lateDays ?? '-'}</td></tr>
                <tr><td>นาทีสายรวม</td><td class="right">${p.snapshot?.attendanceSummary?.lateMinutes ?? '-'}</td></tr>
                <tr><td>หน่วยที่ขาด</td><td class="right">${p.snapshot?.attendanceSummary?.absentUnits ?? '-'}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="box">
            <b>สรุปการลา</b>
            <table>
              <tbody>
                <tr><td>ลาป่วย</td><td class="right">${p.snapshot?.leaveSummary?.sickDays ?? 0}</td></tr>
                <tr><td>ลากิจ</td><td class="right">${p.snapshot?.leaveSummary?.businessDays ?? 0}</td></tr>
                <tr><td>ลาพักร้อน</td><td class="right">${p.snapshot?.leaveSummary?.vacationDays ?? 0}</td></tr>
                <tr><td>ลาเกินสิทธิ์</td><td class="right">${p.snapshot?.leaveSummary?.overLimitDays ?? 0}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
  
        <div class="section box">
          <b>รายการหัก</b>
          <table>
            <thead><tr><th>รายการ</th><th class="right">จำนวนเงิน</th></tr></thead>
            <tbody>
              ${(p.snapshot?.deductions ?? []).map(d => `
                <tr><td>${d.name}</td><td class="right">${(d.amount||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>
              `).join('') || `<tr><td colspan="2" class="muted">-</td></tr>`}
            </tbody>
          </table>
        </div>
  
        <div class="section box">
          <b>รายรับเพิ่มเติม</b>
          <table>
            <thead><tr><th>รายการ</th><th class="right">จำนวนเงิน</th></tr></thead>
            <tbody>
              ${(p.snapshot?.additions ?? []).map(a => `
                <tr><td>${a.name}</td><td class="right">${(a.amount||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>
              `).join('') || `<tr><td colspan="2" class="muted">-</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>`;
  }

  const handlePrintInDrawer = (p: WithId<PayslipNew>) => {
    try {
      const frame = printFrameRef.current;
      if (!frame) {
        toast({ variant: "destructive", title: "พิมพ์ไม่สำเร็จ", description: "ไม่พบ print frame" });
        return;
      }
  
      const html = buildPayslipPrintHtml(p);
  
      // Use srcdoc to trigger load event reliably
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          toast({ title: "กำลังเปิดหน้าพิมพ์..." });
        } catch (e) {
          console.error(e);
          toast({ variant: "destructive", title: "พิมพ์ไม่สำเร็จ", description: "เรียกคำสั่งพิมพ์ไม่ได้" });
        }
      };
  
      frame.srcdoc = html;
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "พิมพ์ไม่สำเร็จ", description: "เกิดข้อผิดพลาดในการสร้างเอกสารพิมพ์" });
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
          footerActions={
            <div className="flex gap-2 justify-end w-full">
              <Button
                variant="outline"
                onClick={() => viewPayslip && handlePrintInDrawer(viewPayslip)}
              >
                <Printer/>
                พิมพ์
              </Button>

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
       <iframe
        ref={printFrameRef}
        title="payslip-print-frame"
        style={{
            position: "fixed",
            right: "0",
            bottom: "0",
            width: "0",
            height: "0",
            border: "0",
            opacity: 0,
            pointerEvents: "none",
        }}
      />
    </>
  );
}

    