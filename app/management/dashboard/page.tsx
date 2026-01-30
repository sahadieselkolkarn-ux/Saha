
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { DateRange } from "react-day-picker";
import { subDays, startOfMonth, endOfMonth, startOfToday, subMonths, format, differenceInDays, startOfYear, endOfYear } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";

import type { Job, Document, AccountingEntry, JobDepartment } from "@/lib/types";
import { JOB_DEPARTMENTS } from "@/lib/constants";

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
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value);
};

const getDateRangeLabel = (range: DateRange | undefined) => {
  if (!range?.from) return "Pick a date";
  if (!range.to) return format(range.from, "LLL dd, y");
  return `${format(range.from, "LLL dd, y")} - ${format(range.to, "LLL dd, y")}`;
};

// --- Main Component ---
export default function ManagementDashboardPage() {
  const { profile } = useAuth();
  const { db } = useFirebase();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [department, setDepartment] = useState<JobDepartment | "ALL">("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(startOfToday()),
    to: endOfMonth(startOfToday()),
  });
  const [comparePrevious, setComparePrevious] = useState(false);

  // --- Firestore Subscriptions ---
  useEffect(() => {
    if (!db) return;

    setLoading(true);

    const jobsRef = collection(db, "jobs");
    const docsRef = collection(db, "documents");
    const entriesRef = collection(db, "accountingEntries");

    const jobsQuery = query(jobsRef, orderBy("createdAt", "desc"));
    const docsQuery = query(docsRef, orderBy("createdAt", "desc"));
    const entriesQuery = query(entriesRef, orderBy("entryDate", "desc"));

    const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
      setJobs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job)));
    });

    const unsubDocs = onSnapshot(docsQuery, (snapshot) => {
      setDocuments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Document)));
    });

    const unsubEntries = onSnapshot(entriesQuery, (snapshot) => {
      setEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AccountingEntry)));
      setLoading(false);
    });

    return () => {
      unsubJobs();
      unsubDocs();
      unsubEntries();
    };
  }, [db]);

  // --- Filtered Data ---
  const filteredData = useMemo(() => {
    const from = dateRange?.from ? startOfToday() && dateRange.from : null;
    const to = dateRange?.to ? dateRange.to : null;

    const filteredJobs = jobs.filter((j) => {
      const created = toDateSafe((j as any).createdAt);
      const inRange = from && to && created ? created >= from && created <= to : true;
      const inDept = department === "ALL" ? true : (j as any).department === department;
      return inRange && inDept;
    });

    const filteredDocs = documents.filter((d) => {
      const created = toDateSafe((d as any).createdAt);
      const inRange = from && to && created ? created >= from && created <= to : true;
      return inRange;
    });

    const filteredEntries = entries.filter((e) => {
      const dt = toDateSafe((e as any).entryDate);
      const inRange = from && to && dt ? dt >= from && dt <= to : true;
      return inRange;
    });

    return { jobs: filteredJobs, documents: filteredDocs, entries: filteredEntries };
  }, [jobs, documents, entries, department, dateRange]);

  // --- Card Data ---
  const cardData = useMemo(() => {
    const totalJobs = filteredData.jobs.length;

    const completedJobs = filteredData.jobs.filter((j) => (j as any).status === "CLOSED").length;
    const pendingJobs = filteredData.jobs.filter((j) => (j as any).status !== "CLOSED").length;

    const totalRevenue = filteredData.entries
      .filter((e) => (e as any).entryType === "RECEIPT")
      .reduce((sum, e) => sum + ((e as any).amount || 0), 0);

    const totalCashIn = filteredData.entries
      .filter((e) => (e as any).entryType === "CASH_IN")
      .reduce((sum, e) => sum + ((e as any).amount || 0), 0);

    const totalCashOut = filteredData.entries
      .filter((e) => (e as any).entryType === "CASH_OUT")
      .reduce((sum, e) => sum + ((e as any).amount || 0), 0);

    // Placeholder AR aging (example)
    const arAging = {
      "0-7": 0,
      "8-30": 0,
      "31-60": 0,
      "60+": 0,
    };

    return {
      totalJobs,
      completedJobs,
      pendingJobs,
      totalRevenue,
      totalCashIn,
      totalCashOut,
      arAging,
    };
  }, [filteredData]);

  // --- Charts Data ---
  const chartsData = useMemo(() => {
    // Monthly jobs count (last 6 months)
    const jobsMonthly = Array.from({ length: 6 }).map((_, i) => {
      const monthStart = startOfMonth(subMonths(startOfToday(), 5 - i));
      const monthEnd = endOfMonth(monthStart);
      const count = jobs.filter((j) => {
        const d = toDateSafe((j as any).createdAt);
        return d && d >= monthStart && d <= monthEnd;
      }).length;
      return { name: format(monthStart, "MMM"), value: count };
    });

    // Backlog = pending jobs by status
    const backlogData = JOB_DEPARTMENTS.map((s) => {
      const count = filteredData.jobs.filter((j) => (j as any).department === s).length;
      return { name: s, value: count };
    }).filter((x) => x.value > 0);

    // Dept breakdown (pie)
    const deptMap: Record<string, number> = {};
    filteredData.jobs.forEach((j) => {
      const dept = (j as any).department || "UNKNOWN";
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    const deptData = Object.entries(deptMap).map(([name, value]) => ({ name, value }));

    // Revenue monthly (last 6 months)
    const revenueMonthly = Array.from({ length: 6 }).map((_, i) => {
      const monthStart = startOfMonth(subMonths(startOfToday(), 5 - i));
      const monthEnd = endOfMonth(monthStart);
      const value = entries
        .filter((e) => {
          const d = toDateSafe((e as any).entryDate);
          return d && (e as any).entryType === "RECEIPT" && d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, e) => sum + ((e as any).amount || 0), 0);
      return { name: format(monthStart, "MMM"), value };
    });

    // Cash Flow monthly (last 6 months)
    const cashFlowMonthly = Array.from({ length: 6 }).map((_, i) => {
      const monthStart = startOfMonth(subMonths(startOfToday(), 5 - i));
      const monthEnd = endOfMonth(monthStart);
      const cashIn = entries
        .filter((e) => {
          const d = toDateSafe((e as any).entryDate);
          return d && ((e as any).entryType === "CASH_IN" || (e as any).entryType === "RECEIPT") && d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, e) => sum + ((e as any).amount || 0), 0);
      const cashOut = entries
        .filter((e) => {
          const d = toDateSafe((e as any).entryDate);
          return d && (e as any).entryType === "CASH_OUT" && d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, e) => sum + ((e as any).amount || 0), 0);
      return { name: format(monthStart, "MMM"), cashIn, cashOut };
    });

    // AR Aging Bar Chart
    const arAgingData = [
      { name: "0-7 Days", value: cardData.arAging["0-7"] },
      { name: "8-30 Days", value: cardData.arAging["8-30"] },
      { name: "31-60 Days", value: cardData.arAging["31-60"] },
      { name: "60+ Days", value: cardData.arAging["60+"] },
    ];

    return { jobsMonthly, backlogData, deptData, revenueMonthly, cashFlowMonthly, arAgingData };
  }, [jobs, documents, entries, cardData.arAging, filteredData.jobs]);

  // --- Render Logic ---
  if (!profile) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  if (profile.role !== "ADMIN" && profile.department !== "MANAGEMENT") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>This page is for administrators and management only.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleDatePreset = (preset: string) => {
    const today = startOfToday();
    switch (preset) {
      case "TODAY":
        setDateRange({ from: today, to: today });
        break;
      case "LAST_7_DAYS":
        setDateRange({ from: subDays(today, 6), to: today });
        break;
      case "THIS_MONTH":
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
      case "LAST_3_MONTHS":
        setDateRange({ from: startOfMonth(subMonths(today, 2)), to: endOfMonth(today) });
        break;
      default:
        setDateRange({ from: today, to: today });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="An overview of your business activities." />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Adjust what data is shown in the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <Label>Date Range</Label>
            <div className="flex flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {getDateRangeLabel(dateRange)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              <Select onValueChange={handleDatePreset}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Quick Presets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAY">Today</SelectItem>
                  <SelectItem value="LAST_7_DAYS">Last 7 Days</SelectItem>
                  <SelectItem value="THIS_MONTH">This Month</SelectItem>
                  <SelectItem value="LAST_3_MONTHS">Last 3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Department</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as any)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                <SelectItem value="COMMONRAIL">COMMONRAIL</SelectItem>
                <SelectItem value="CAR_SERVICE">CAR_SERVICE</SelectItem>
                <SelectItem value="MECHANIC">MECHANIC</SelectItem>
                <SelectItem value="OFFICE">OFFICE</SelectItem>
                <SelectItem value="OUTSOURCE">OUTSOURCE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={comparePrevious} onCheckedChange={setComparePrevious} />
            <Label>Compare Previous Period</Label>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Jobs</CardTitle>
            <CardDescription>Jobs in selected period</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{cardData.totalJobs}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
            <CardDescription>Completed jobs</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{cardData.completedJobs}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <CardDescription>Jobs not completed</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{cardData.pendingJobs}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Revenue in selected period</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(cardData.totalRevenue)}</CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jobs Volume (Last 6 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartsData.jobsMonthly}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backlog by Department</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartsData.backlogData}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs by Department</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartsData.deptData} dataKey="value" nameKey="name" label>
                  {chartsData.deptData.map((_, idx) => (
                    <Cell key={idx} fill={`hsl(var(--chart-${(idx % 5) + 1}))`} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash Flow (Last 6 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartsData.cashFlowMonthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="cashIn" name="Cash In" stroke="hsl(var(--chart-2))" />
                <Line type="monotone" dataKey="cashOut" name="Cash Out" stroke="hsl(var(--chart-5))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
