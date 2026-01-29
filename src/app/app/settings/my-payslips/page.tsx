"use client";

import { useState, useEffect, useMemo } from "react";
import { collectionGroup, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
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
import { Loader2, CheckCircle, MessageSquareWarning, Eye } from "lucide-react";
import type { PayslipNew, PayslipSnapshot } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { newPayslipStatusLabel } from "@/lib/ui-labels";
import { format } from "date-fns";
import { PayslipSlipDrawer } from "@/components/payroll/PayslipSlipDrawer";
import { PayslipSlipView, calcTotals } from "@/components/payroll/PayslipSlipView";
import { formatPayslipAsText, formatPayslipAsJson } from "@/lib/payroll/formatPayslipCopy";

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
  isOpen,
  onClose,
  onSubmit,
  isSubmitting
}: {
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
            กรุณาระบุเหตุผลที่ต้องการแก้ไขให้ชัดเจน
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
  
  type PayslipWithRef = WithId<PayslipNew> & { refPath: string };
  const [payslips, setPayslips] = useState<PayslipWithRef[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [viewingPayslip, setViewingPayslip] = useState<PayslipWithRef | null>(null);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);

  useEffect(() => {
    if (!db || !profile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const payslipsQuery = query(
      collectionGroup(db, 'payslips'),
      where('userId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(payslipsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        refPath: doc.ref.path, 
        ...doc.data()
      } as PayslipWithRef));

      data.sort((a, b) => (b.sentAt?.toDate()?.getTime() || 0) - (a.sentAt?.toDate()?.getTime() || 0));
      
      setPayslips(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching payslips:", error);
      toast({ variant: 'destructive', title: 'ไม่สามารถโหลดข้อมูลได้', description: error.message });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, profile, toast]);

  const handleAccept = async () => {
    if (!db || !viewingPayslip) return;
    setActioningId(viewingPayslip.id);
    try {
      const payslipRef = doc(db, viewingPayslip.refPath);
      await updateDoc(payslipRef, {
        status: 'READY_TO_PAY',
        employeeAcceptedAt: serverTimestamp(),
        employeeNote: null,
      });
      toast({ title: 'ยืนยันสลิปเรียบร้อย' });
      setViewingPayslip(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'ทำรายการไม่สำเร็จ', description: error.message });
    } finally {
      setActioningId(null);
    }
  };
  
  const handleRequestRevision = async (reason: string) => {
    if (!db || !viewingPayslip) return;
    setActioningId(viewingPayslip.id);
    try {
      const payslipRef = doc(db, viewingPayslip.refPath);
      await updateDoc(payslipRef, {
        status: 'REVISION_REQUESTED',
        employeeNote: reason,
      });
      toast({ title: 'ส่งคำร้องแก้ไขเรียบร้อย' });
      setIsRevisionDialogOpen(false);
      setViewingPayslip(null);
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
  
  const periodLabel = useMemo(() => {
    if (!viewingPayslip) return '';
    const [year, month, period] = viewingPayslip.batchId.split('-');
    const date = new Date(Number(year), Number(month) - 1);
    return `งวด ${period} (${format(date, 'MMMM yyyy')})`;
  }, [viewingPayslip]);
  
  const drawerTotals = useMemo(() => calcTotals(viewingPayslip?.snapshot), [viewingPayslip]);

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
                      <Button variant="outline" size="sm" onClick={() => setViewingPayslip(p)}>
                        <Eye className="mr-2"/> ดูสลิป
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
      
      {viewingPayslip && (
        <PayslipSlipDrawer
            open={!!viewingPayslip}
            onOpenChange={(open) => !open && setViewingPayslip(null)}
            title="รายละเอียดสลิปเงินเดือน"
            copyText={formatPayslipAsText({ userName: viewingPayslip.userName, periodLabel, snapshot: viewingPayslip.snapshot, totals: drawerTotals })}
            copyJson={formatPayslipAsJson(viewingPayslip.snapshot)}
            footerActions={
              viewingPayslip.status === 'SENT_TO_EMPLOYEE' && (
                <>
                  <Button variant="destructive" onClick={() => setIsRevisionDialogOpen(true)} disabled={actioningId !== null}>
                    <MessageSquareWarning className="mr-2" /> ร้องขอแก้ไข
                  </Button>
                  <Button onClick={handleAccept} disabled={actioningId !== null}>
                    {actioningId === viewingPayslip.id ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle className="mr-2"/>}
                    ยอมรับ
                  </Button>
                </>
              )
            }
        >
            <PayslipSlipView
                userName={viewingPayslip.userName}
                periodLabel={periodLabel}
                snapshot={viewingPayslip.snapshot}
                mode="read"
            />
        </PayslipSlipDrawer>
      )}

      {viewingPayslip && isRevisionDialogOpen && (
        <RevisionDialog
          isOpen={isRevisionDialogOpen}
          onClose={() => setIsRevisionDialogOpen(false)}
          onSubmit={handleRequestRevision}
          isSubmitting={actioningId === viewingPayslip.id}
        />
      )}
    </>
  );
}
