
"use client";

import { useState, useEffect } from "react";
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
import { Loader2, CheckCircle, MessageSquareWarning } from "lucide-react";
import type { PayslipNew } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { newPayslipStatusLabel } from "@/lib/ui-labels";

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
  
  const [payslips, setPayslips] = useState<(WithId<PayslipNew> & { refPath: string })[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [revisionPayslip, setRevisionPayslip] = useState<WithId<PayslipNew> & { refPath: string } | null>(null);

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
      setRevisionPayslip(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ทำรายการไม่สำเร็จ', description: error.message });
    } finally {
      setActioningId(null);
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
                      {p.status === 'SENT_TO_EMPLOYEE' && (
                        <div className="flex gap-2 justify-end">
                           <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAccept(p)}
                            disabled={actioningId !== null}
                          >
                            {actioningId === p.id ? <Loader2 className="mr-2 animate-spin" /> : <CheckCircle />}
                            ยอมรับ
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRevisionPayslip(p)}
                            disabled={actioningId !== null}
                          >
                            <MessageSquareWarning />
                            ร้องขอแก้ไข
                          </Button>
                        </div>
                      )}
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
    </>
  );
}
