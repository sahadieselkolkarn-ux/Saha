
"use client";

import { useState, useMemo, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, type FirestoreError } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format, getYear } from 'date-fns';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown, BarChart, AlertCircle, ExternalLink, Link as LinkIcon } from "lucide-react";
import Link from 'next/link';

import type { WithId } from "@/firebase/firestore/use-collection";
import type { PurchaseDoc, Vendor } from "@/lib/types";

const currentYear = getYear(new Date());
const yearOptions = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
const monthOptions = [
  { value: "ALL", label: "ทั้งปี" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString().padStart(2, '0'),
    label: format(new Date(currentYear, i), 'MMMM'),
  })),
];

// Helper to format currency
const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

type AggregatedVendor = {
  vendorId: string;
  vendorName: string;
  billCount: number;
  totalAmount: number;
};

export default function PurchaseReportsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [year, setYear] = useState<string>(currentYear.toString());
  const [month, setMonth] = useState<string>("ALL");
  const [vendorId, setVendorId] = useState<string>("ALL");

  const [vendors, setVendors] = useState<WithId<Vendor>[]>([]);
  const [reportData, setReportData] = useState<WithId<PurchaseDoc>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  // Fetch vendors for filter dropdown
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "vendors"), where("isActive", "==", true), orderBy("shortName", "asc"));
    getDocs(q).then(snapshot => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<Vendor>)));
    }).catch(err => {
      toast({ variant: 'destructive', title: 'Could not load vendors' });
    });
  }, [db, toast]);

  const handleGenerateReport = async () => {
    if (!db) return;
    setLoading(true);
    setReportData(null);
    setError(null);
    setIndexCreationUrl(null);

    try {
      let startDate: string, endDate: string;
      if (month === "ALL") {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
      } else {
        startDate = `${year}-${month}-01`;
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
      }

      const constraints = [
        where('docDate', '>=', startDate),
        where('docDate', '<=', endDate)
      ];
      if (vendorId !== "ALL") {
        constraints.push(where('vendorId', '==', vendorId));
      }

      const q = query(collection(db, "purchaseDocs"), ...constraints);
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<PurchaseDoc>));
      
      // Client-side sort
      data.sort((a, b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime());
      
      setReportData(data);
    } catch (e: any) {
      setError(e);
      if (e.message?.includes('requires an index')) {
        const urlMatch = e.message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) setIndexCreationUrl(urlMatch[0]);
      } else {
        toast({ variant: 'destructive', title: "Error fetching report", description: e.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const aggregatedData = useMemo(() => {
    if (!reportData) return null;

    const totalAmount = reportData.reduce((sum, doc) => sum + doc.grandTotal, 0);
    const billCount = reportData.length;

    const byVendor = reportData.reduce((acc, doc) => {
      const vid = doc.vendorId;
      if (!acc[vid]) {
        acc[vid] = { vendorId: vid, vendorName: doc.vendorSnapshot.companyName, billCount: 0, totalAmount: 0 };
      }
      acc[vid].billCount += 1;
      acc[vid].totalAmount += doc.grandTotal;
      return acc;
    }, {} as Record<string, AggregatedVendor>);
    
    const vendorSummary = Object.values(byVendor).sort((a, b) => b.totalAmount - a.totalAmount);
    const topVendor = vendorSummary[0] || null;

    return { totalAmount, billCount, topVendor, vendorSummary };
  }, [reportData]);
  
  const exportToCsv = (filename: string, rows: (string[] | number[])[]) => {
      const processRow = (row: any[]): string => row.map(val => {
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
      }).join(',');
  
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(processRow).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }

  const handleExportDetails = () => {
    if (!reportData) return;
    const header = ["Date", "Doc No", "Vendor", "Invoice No", "Taxed", "Payment", "Status", "Total"];
    const rows = [header, ...reportData.map(d => [
        d.docDate, d.docNo, d.vendorSnapshot.companyName, d.invoiceNo, d.withTax ? 'Y' : 'N', d.paymentMode, d.status, d.grandTotal
    ])];
    exportToCsv(`purchase-details-${year}-${month}.csv`, rows);
  };

  const handleExportSummary = () => {
    if (!aggregatedData) return;
    const header = ["Vendor", "Bill Count", "Total Amount"];
    const rows = [header, ...aggregatedData.vendorSummary.map(s => [
        s.vendorName, s.billCount, s.totalAmount
    ])];
    exportToCsv(`purchase-summary-by-vendor-${year}-${month}.csv`, rows);
  };

  if (!hasPermission) {
    return (
      <>
        <PageHeader title="รายงานการซื้อ" />
        <Card className="text-center py-12">
          <CardHeader><CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle><CardDescription>สำหรับฝ่ายบริหาร/ผู้ดูแลเท่านั้น</CardDescription></CardHeader>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="รายงานการซื้อ" description="สรุปภาพรวมและรายละเอียดการจัดซื้อ" />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>ตัวกรองรายงาน</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2"><FormLabel>ปี</FormLabel><Select value={year} onValueChange={setYear}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2"><FormLabel>เดือน</FormLabel><Select value={month} onValueChange={setMonth}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2 flex-1 min-w-[200px]"><FormLabel>ร้านค้า</FormLabel><Select value={vendorId} onValueChange={setVendorId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">ทุกร้านค้า</SelectItem>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.shortName} - {v.companyName}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={handleGenerateReport} disabled={loading}>{loading ? <Loader2 className="mr-2 animate-spin" /> : <BarChart/>} ดึงรายงาน</Button>
        </CardContent>
      </Card>
      
      {loading && <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8" /></div>}

      {indexCreationUrl && (
        <Card className="text-center py-12 bg-destructive/10 border-destructive/20">
            <CardHeader className="items-center"><AlertCircle className="h-10 w-10 text-destructive mb-4" /><CardTitle>ต้องสร้างดัชนี (Index) ก่อน</CardTitle><CardDescription className="max-w-xl mx-auto">ฐานข้อมูลต้องการ Index เพื่อกรองข้อมูล กรุณากดปุ่มด้านล่างเพื่อสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที) เมื่อสร้างเสร็จแล้ว ให้ลองดึงรายงานอีกครั้ง</CardDescription></CardHeader>
            <CardContent className="flex gap-4 justify-center">
              <Button asChild><a href={indexCreationUrl!} target="_blank" rel="noopener noreferrer"><ExternalLink /> เปิดหน้าสร้าง Index</a></Button>
              <Button variant="outline" onClick={handleGenerateReport}>Retry</Button>
            </CardContent>
        </Card>
      )}

      {reportData && aggregatedData && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader><CardTitle>ยอดซื้อรวม</CardTitle><CardDescription>ไม่รวมส่วนลด</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(aggregatedData.totalAmount)}</p></CardContent></Card>
            <Card><CardHeader><CardTitle>จำนวนบิล</CardTitle><CardDescription>จำนวนเอกสารการซื้อทั้งหมด</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{aggregatedData.billCount}</p></CardContent></Card>
            <Card><CardHeader><CardTitle>ร้านค้าที่ซื้อเยอะสุด</CardTitle><CardDescription>{aggregatedData.topVendor?.vendorName || '-'}</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(aggregatedData.topVendor?.totalAmount || 0)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>สรุปตามร้านค้า (Top 10)</CardTitle><Button variant="outline" size="sm" onClick={handleExportSummary}><FileDown/> Export CSV</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>ร้านค้า</TableHead><TableHead className="text-right">จำนวนบิล</TableHead><TableHead className="text-right">ยอดรวม</TableHead></TableRow></TableHeader>
                <TableBody>
                  {aggregatedData.vendorSummary.slice(0, 10).map(v => (
                    <TableRow key={v.vendorId}><TableCell>{v.vendorName}</TableCell><TableCell className="text-right">{v.billCount}</TableCell><TableCell className="text-right">{formatCurrency(v.totalAmount)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>รายการบิลทั้งหมด</CardTitle><Button variant="outline" size="sm" onClick={handleExportDetails}><FileDown/> Export CSV</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>เลขที่เอกสาร</TableHead><TableHead>ร้านค้า</TableHead><TableHead>เลขที่บิล</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">ยอดรวม</TableHead><TableHead/></TableRow></TableHeader>
                <TableBody>
                  {reportData.map(d => (
                    <TableRow key={d.id}><TableCell>{d.docDate}</TableCell><TableCell>{d.docNo}</TableCell><TableCell>{d.vendorSnapshot.shortName}</TableCell><TableCell>{d.invoiceNo}</TableCell><TableCell>{d.status}</TableCell><TableCell className="text-right">{formatCurrency(d.grandTotal)}</TableCell><TableCell><Button asChild variant="ghost" size="icon"><Link href={`/app/office/parts/purchases/${d.id}`}><LinkIcon/></Link></Button></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
