"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { DateRange } from "react-day-picker";
import { 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfToday, 
  subMonths, 
  format, 
  differenceInDays, 
  startOfYear, 
  isWithinInterval,
  isBefore,
  parseISO
} from "date-fns";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  CartesianGrid, 
  Legend 
} from "recharts";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar as CalendarIcon, TrendingUp, TrendingDown, AlertCircle, Clock, ArrowRight, Wallet, Users, Receipt, CheckCircle2 } from "lucide-react";

import type { Job, Document, AccountingEntry, JobDepartment, AccountingObligation } from "@/lib/types";
import { JOB_DEPARTMENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { deptLabel } from "@/lib/ui-labels";

// --- Helper Functions ---
const toDateSafe = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts instanceof Timestamp) return ts.toDate();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
};

const getTrend = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const TrendIndicator = ({ value }: { value: number }) => {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <div className={cn("flex items-center text-xs font-medium", isUp ? "text-green-600" : "text-destructive")}>
      {isUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </div>
  );
};

const isOutflow = (job: Job) => ["DONE", "WAITING_CUSTOMER_PICKUP", "CLOSED"].includes(job.status);

// --- Main Dashboard Component ---
function AppDashboardPage() {
  const { db } = useFirebase();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [obligations, setObligations] = useState<AccountingObligation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(startOfToday()),
    to: endOfMonth(startOfToday()),
  });

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    const unsubJobs = onSnapshot(collection(db, "jobs"), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
    });
    const unsubDocs = onSnapshot(collection(db, "documents"), (snap) => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
    });
    const unsubEntries = onSnapshot(collection(db, "accountingEntries"), (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingEntry)));
    });
    const unsubObligations = onSnapshot(collection(db, "accountingObligations"), (snap) => {
      setObligations(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingObligation)));
      setLoading(false);
    });

    return () => {
      unsubJobs(); unsubDocs(); unsubEntries(); unsubObligations();
    };
  }, [db]);

  const stats = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;

    const from = dateRange.from;
    const to = dateRange.to;
    const diff = differenceInDays(to, from) + 1;
    const prevFrom = subDays(from, diff);
    const prevTo = subDays(to, diff);

    const isInPeriod = (d: Date | null) => d && isWithinInterval(d, { start: from, end: to });
    const isInPrevPeriod = (d: Date | null) => d && isWithinInterval(d, { start: prevFrom, end: prevTo });

    // 1. KPI Calculations
    const currentInflow = jobs.filter(j => isInPeriod(toDateSafe(j.createdAt)));
    const prevInflow = jobs.filter(j => isInPrevPeriod(toDateSafe(j.createdAt)));

    const currentOutflow = jobs.filter(j => isOutflow(j) && isInPeriod(toDateSafe(j.lastActivityAt)));
    const prevOutflow = jobs.filter(j => isOutflow(j) && isInPrevPeriod(toDateSafe(j.lastActivityAt)));

    const backlog = jobs.filter(j => !isOutflow(j));
    
    const currentCashIn = entries.filter(e => (e.entryType === 'RECEIPT' || e.entryType === 'CASH_IN') && isInPeriod(toDateSafe(e.entryDate))).reduce((s, e) => s + e.amount, 0);
    const prevCashIn = entries.filter(e => (e.entryType === 'RECEIPT' || e.entryType === 'CASH_IN') && isInPrevPeriod(toDateSafe(e.entryDate))).reduce((s, e) => s + e.amount, 0);
    const currentCashOut = entries.filter(e => e.entryType === 'CASH_OUT' && isInPeriod(toDateSafe(e.entryDate))).reduce((s, e) => s + e.amount, 0);
    const prevCashOut = entries.filter(e => e.entryType === 'CASH_OUT' && isInPrevPeriod(toDateSafe(e.entryDate))).reduce((s, e) => s + e.amount, 0);

    const arBalance = obligations.filter(o => o.type === 'AR' && o.status !== 'PAID').reduce((s, o) => s + o.balance, 0);
    const apBalance = obligations.filter(o => o.type === 'AP' && o.status !== 'PAID').reduce((s, o) => s + o.balance, 0);

    // 2. Charts: Job Volume (6 Months)
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const mStart = startOfMonth(subMonths(from, 5 - i));
      const mEnd = endOfMonth(mStart);
      const interval = { start: mStart, end: mEnd };
      
      const inf = jobs.filter(j => isWithinInterval(toDateSafe(j.createdAt)!, interval)).length;
      const outf = jobs.filter(j => isOutflow(j) && isWithinInterval(toDateSafe(j.lastActivityAt)!, interval)).length;
      
      return { 
        name: format(mStart, "MMM yy"), 
        Inflow: inf, 
        Outflow: outf,
        net: inf - outf
      };
    });

    // 3. Dept Breakdown
    const deptStats = JOB_DEPARTMENTS.map(dept => {
      const deptJobs = backlog.filter(j => j.department === dept);
      const now = new Date();
      return {
        dept,
        label: deptLabel(dept),
        count: deptJobs.length,
        over7: deptJobs.filter(j => differenceInDays(now, toDateSafe(j.createdAt)!) > 7).length,
        over14: deptJobs.filter(j => differenceInDays(now, toDateSafe(j.createdAt)!) > 14).length,
      };
    }).filter(d => d.count > 0);

    const currentInflowByDept = JOB_DEPARTMENTS.map(dept => ({
      name: deptLabel(dept),
      value: currentInflow.filter(j => j.department === dept).length
    })).filter(v => v.value > 0);

    // 4. Financial Flow (6 Months)
    const cashFlowData = Array.from({ length: 6 }).map((_, i) => {
      const mStart = startOfMonth(subMonths(from, 5 - i));
      const mEnd = endOfMonth(mStart);
      const interval = { start: mStart, end: mEnd };
      
      const cin = entries.filter(e => (e.entryType === 'RECEIPT' || e.entryType === 'CASH_IN') && isWithinInterval(toDateSafe(e.entryDate)!, interval)).reduce((s, e) => s + e.amount, 0);
      const cout = entries.filter(e => e.entryType === 'CASH_OUT' && isWithinInterval(toDateSafe(e.entryDate)!, interval)).reduce((s, e) => s + e.amount, 0);
      
      return { name: format(mStart, "MMM yy"), "Cash In": cin, "Cash Out": cout, Net: cin - cout };
    });

    // 5. Alerts
    const alerts = [
      { 
        label: "เอกสารรอตรวจสอบรายการขาย", 
        count: documents.filter(d => d.status === 'PENDING_REVIEW').length, 
        link: "/app/management/accounting/inbox",
        icon: Receipt
      },
      { 
        label: "ใบเสร็จออกแล้วรอยืนยัน", 
        count: documents.filter(d => d.docType === 'RECEIPT' && d.receiptStatus === 'ISSUED_NOT_CONFIRMED').length, 
        link: "/app/management/accounting/inbox",
        icon: CheckCircle2
      },
      { 
        label: "ลูกหนี้เกินกำหนดชำระ", 
        count: obligations.filter(o => o.type === 'AR' && o.status !== 'PAID' && o.dueDate && isBefore(parseISO(o.dueDate), startOfToday())).length, 
        link: "/app/management/accounting/receivables-payables?tab=debtors",
        icon: Wallet
      },
      { 
        label: "งานค้างเกิน 14 วัน", 
        count: backlog.filter(j => differenceInDays(new Date(), toDateSafe(j.createdAt)!) > 14).length, 
        link: "/app/jobs",
        icon: AlertCircle,
        variant: "destructive"
      }
    ].filter(a => a.count > 0);

    return {
      kpis: [
        { label: "New Jobs (งานเข้า)", value: currentInflow.length, trend: getTrend(currentInflow.length, prevInflow.length), desc: "งานที่เปิดใหม่ในช่วงเวลานี้", link: "/app/jobs" },
        { label: "Jobs Done (งานออก)", value: currentOutflow.length, trend: getTrend(currentOutflow.length, prevOutflow.length), desc: "งานที่ซ่อมเสร็จในช่วงเวลานี้", link: "/app/jobs" },
        { label: "Current Backlog", value: backlog.length, desc: "จำนวนงานที่ยังค้างอยู่ในระบบทั้งหมด", link: "/app/jobs", isNeutral: true },
        { label: "Net Cash In", value: currentCashIn - currentCashOut, trend: getTrend(currentCashIn - currentCashOut, prevCashIn - prevCashOut), desc: "เงินหมุนเวียนสุทธิ (รับ-จ่าย)", link: "/app/management/accounting/cashbook", isCurrency: true },
      ],
      fin: [
        { label: "Cash In", value: currentCashIn, trend: getTrend(currentCashIn, prevCashIn), link: "/app/management/accounting/cashbook?tab=in" },
        { label: "Cash Out", value: currentCashOut, trend: getTrend(currentCashOut, prevCashOut), link: "/app/management/accounting/cashbook?tab=out" },
        { label: "AR Balance", value: arBalance, link: "/app/management/accounting/receivables-payables?tab=debtors" },
        { label: "AP Balance", value: apBalance, link: "/app/management/accounting/receivables-payables?tab=creditors" },
      ],
      last6Months,
      deptStats,
      currentInflowByDept,
      cashFlowData,
      alerts
    };
  }, [jobs, documents, entries, obligations, dateRange]);

  const handleDatePreset = (preset: string) => {
    const today = startOfToday();
    switch (preset) {
      case "TODAY": setDateRange({ from: today, to: today }); break;
      case "LAST_7_DAYS": setDateRange({ from: subDays(today, 6), to: today }); break;
      case "THIS_MONTH": setDateRange({ from: startOfMonth(today), to: endOfMonth(today) }); break;
      case "LAST_3_MONTHS": setDateRange({ from: startOfMonth(subMonths(today, 2)), to: endOfMonth(today) }); break;
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader title="Executive Dashboard" description="ภาพรวมธุรกิจและการเงินสำหรับผู้บริหาร">
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal min-w-[240px]">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "dd MMM yy")} - {format(dateRange.to, "dd MMM yy")}</> : format(dateRange.from, "dd MMM yy")) : <span>Select period</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
          <Select onValueChange={handleDatePreset} defaultValue="THIS_MONTH">
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAY">วันนี้</SelectItem>
              <SelectItem value="LAST_7_DAYS">7 วันที่ผ่านมา</SelectItem>
              <SelectItem value="THIS_MONTH">เดือนนี้</SelectItem>
              <SelectItem value="LAST_3_MONTHS">3 เดือนที่ผ่านมา</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.kpis.map((kpi, i) => (
          <Card key={i} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => router.push(kpi.link)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
              {!kpi.isNeutral && <TrendIndicator value={kpi.trend!} />}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {kpi.isCurrency ? formatCurrency(kpi.value) : kpi.value.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Job Volume Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Job Volume (6 Months)</CardTitle>
            <CardDescription>เปรียบเทียบงานเข้า (Inflow) และงานซ่อมเสร็จ (Outflow)</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.last6Months}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  cursor={{fill: 'transparent'}} 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="Inflow" name="งานเข้า" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Outflow" name="งานออก" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Backlog by Dept */}
        <Card>
          <CardHeader>
            <CardTitle>Backlog Analysis</CardTitle>
            <CardDescription>วิเคราะห์งานค้างแยกตามแผนกและระยะเวลา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.deptStats} dataKey="count" nameKey="label" innerRadius={60} outerRadius={80} paddingAngle={5}>
                    {stats.deptStats.map((_, i) => <Cell key={i} fill={`hsl(var(--chart-${(i % 5) + 1}))`} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-md border text-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">แผนก</th>
                    <th className="p-2 text-right font-medium">ค้าง</th>
                    <th className="p-2 text-right font-medium text-amber-600">{">"}7วัน</th>
                    <th className="p-2 text-right font-medium text-destructive">{">"}14วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.deptStats.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/app/jobs?department=${d.dept}`)}>
                      <td className="p-2 font-medium">{d.label}</td>
                      <td className="p-2 text-right">{d.count}</td>
                      <td className="p-2 text-right">{d.over7}</td>
                      <td className="p-2 text-right font-bold text-destructive">{d.over14}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Financial Flow */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cash Flow Trend</CardTitle>
            <CardDescription>แนวโน้มเงินสดเข้า-ออกในรอบ 6 เดือน</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="Cash In" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Cash Out" stroke="hsl(var(--chart-5))" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alerts & To-do */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                Alerts & To-do
              </CardTitle>
              <CardDescription>รายการด่วนที่ต้องจัดการ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.alerts.length > 0 ? stats.alerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => router.push(alert.link)}>
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-full", alert.variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                      <alert.icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{alert.label}</span>
                  </div>
                  <Badge variant={alert.variant === "destructive" ? "destructive" : "secondary"} className="h-6 min-w-[24px] flex justify-center">{alert.count}</Badge>
                </div>
              )) : (
                <div className="text-center py-10 text-muted-foreground italic text-sm">
                  ยอดเยี่ยม! ไม่มีรายการค้างที่ต้องเร่งด่วน
                </div>
              )}
            </CardContent>
          </Card>

          {/* Jobs By Dept Snapshot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">New Jobs by Dept (Period)</CardTitle>
            </CardHeader>
            <CardContent className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.currentInflowByDept} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} fontSize={10} />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" name="งานใหม่" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Financial Snapshot */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.fin.map((item, i) => (
          <Card key={i} className="bg-muted/30 border-dashed hover:border-primary/50 transition-colors cursor-pointer" onClick={() => router.push(item.link)}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</span>
                {item.trend !== undefined && <TrendIndicator value={item.trend} />}
              </div>
              <div className="text-xl font-bold">{formatCurrency(item.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Wrapper with Auth Guard
export default function ManagementDashboardPage() {
  const { profile, loading } = useAuth();
  const isAllowed = profile?.department === "MANAGEMENT" || profile?.role === "ADMIN" || profile?.role === "MANAGER";

  if (loading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>หน้าจอนี้สำหรับผู้บริหารและผู้ดูแลระบบเท่านั้น</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link href="/app/jobs">กลับไปยังหน้างาน</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AppDashboardPage />;
}
