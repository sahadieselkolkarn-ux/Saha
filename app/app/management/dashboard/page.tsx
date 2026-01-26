
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { DateRange } from "react-day-picker";
import { subDays, startOfMonth, endOfMonth, startOfToday, subMonths, format, differenceInDays, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

// UI Components
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon, TrendingDown, TrendingUp, AlertCircle, EyeOff, Eye, Loader2 } from "lucide-react";

// Types
import type { Job, Document as DocumentType, AccountingEntry, AccountingObligation, JobStatus, JobDepartment } from "@/lib/types";
import { JOB_DEPARTMENTS } from "@/lib/constants";

// Helper Functions
const formatCurrency = (value: number) => `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatBucket = (value: number) => {
    if (value < 50000) return "0 - 50k";
    if (value < 200000) return "50k - 200k";
    return "200k+";
};
const RISK_DAYS = 7;

// Main Component
export default function ManagementDashboardPage() {
    const { profile } = useAuth();
    const { db } = useFirebase();

    // --- State Management ---
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
    const [department, setDepartment] = useState<JobDepartment | 'ALL'>('ALL');
    const [showActualNumbers, setShowActualNumbers] = useState(false);
    
    // Raw Data State
    const [jobs, setJobs] = useState<Job[]>([]);
    const [documents, setDocuments] = useState<DocumentType[]>([]);
    const [entries, setEntries] = useState<AccountingEntry[]>([]);
    const [obligations, setObligations] = useState<AccountingObligation[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- Data Fetching ---
    useEffect(() => {
        if (!db) return;
        setLoading(true);
        setError(null);
        let initialLoadCount = 0;
        const totalCollections = 4;

        const handleInitialLoad = () => {
          initialLoadCount++;
          if (initialLoadCount >= totalCollections) {
            setLoading(false);
          }
        };

        const qJobs = query(collection(db, "jobs"));
        const qDocs = query(collection(db, "documents"));
        const qEntries = query(collection(db, "accountingEntries"));
        const qObligations = query(collection(db, "accountingObligations"), where("type", "==", "AR"));

        const unsubs = [
            onSnapshot(qJobs, snap => { setJobs(snap.docs.map(d => ({id: d.id, ...d.data() } as Job))); handleInitialLoad(); }, err => { setError(err.message); handleInitialLoad(); }),
            onSnapshot(qDocs, snap => { setDocuments(snap.docs.map(d => ({id: d.id, ...d.data() } as DocumentType))); handleInitialLoad(); }, err => { setError(err.message); handleInitialLoad(); }),
            onSnapshot(qEntries, snap => { setEntries(snap.docs.map(d => ({id: d.id, ...d.data() } as AccountingEntry))); handleInitialLoad(); }, err => { setError(err.message); handleInitialLoad(); }),
            onSnapshot(qObligations, snap => { setObligations(snap.docs.map(d => ({id: d.id, ...d.data() } as AccountingObligation))); handleInitialLoad(); }, err => { setError(err.message); handleInitialLoad(); })
        ];
        
        return () => unsubs.forEach(unsub => unsub());
    }, [db]);
    
    // --- Date Helpers ---
    const toDateSafe = (v: any): Date | null => {
        try {
            if (!v) return null;
            if (v instanceof Date && !isNaN(v.getTime())) return v;
            if (typeof v === 'string') {
                const d = parseISO(v);
                if (!isNaN(d.getTime())) return d;
            }
            if (typeof v.toDate === 'function') {
                const d = v.toDate();
                if (d instanceof Date && !isNaN(d.getTime())) return d;
            }
            return null;
        } catch {
            return null;
        }
    };

    const inDateRange = (v: any): boolean => {
        if (!dateRange?.from) return false;
        const from = dateRange.from;
        const to = dateRange.to || from;
        const d = toDateSafe(v);
        if (!d) return false;
        return d >= from && d <= to;
    };
    
    // --- Memoized Data Processing ---
    const filteredData = useMemo(() => {
        const filteredJobs = jobs.filter(j => 
            (department === 'ALL' || j.department === department)
        );
        const filteredDocuments = documents.filter(d => inDateRange(d.docDate));
        const filteredEntries = entries.filter(e => inDateRange(e.entryDate));

        return { jobs: filteredJobs, documents: filteredDocuments, entries: filteredEntries, obligations };
    }, [jobs, documents, entries, obligations, dateRange, department]);


    // --- Executive Cards Data ---
    const cardData = useMemo(() => {
        const today = new Date();
        const { jobs: allJobs, documents: docsInDateRange, entries: entriesInDateRange, obligations: allObligations } = filteredData;
        
        const isClosed = (status?: JobStatus) => ["CLOSED", "DONE", "COMPLETED"].includes(String(status ?? "").toUpperCase());
        
        // 1. Open Jobs
        const openJobs = allJobs.filter(j => !isClosed(j.status));
        
        // 2. Completed Jobs (in range)
        const completedJobsInRange = allJobs.filter(j => isClosed(j.status) && inDateRange(j.closedDate ?? j.updatedAt));

        // 3. At-risk Jobs
        const atRiskJobs = openJobs.filter(j => {
            const created = toDateSafe(j.createdAt);
            if (!created) return false;
            return differenceInDays(today, created) > RISK_DAYS;
        });

        // 4. On-time %
        const onTimeJobs = completedJobsInRange.filter(j => {
            const created = toDateSafe(j.createdAt);
            const closed = toDateSafe(j.closedDate ?? j.updatedAt);
            if (!created || !closed) return false;
            return differenceInDays(closed, created) <= RISK_DAYS;
        });
        const onTimePercentage = completedJobsInRange.length > 0 ? (onTimeJobs.length / completedJobsInRange.length) * 100 : 0;
        
        // 5. Revenue
        const revenueDocs = docsInDateRange.filter(d => d.status === 'PAID' && ['TAX_INVOICE', 'RECEIPT', 'DELIVERY_NOTE'].includes(d.docType));
        const totalRevenue = revenueDocs.reduce((sum, doc) => sum + doc.grandTotal, 0);
        
        // 6. Cash In
        const cashIn = entriesInDateRange.filter(e => e.entryType === 'CASH_IN' || e.entryType === 'RECEIPT').reduce((sum, e) => sum + e.amount, 0);

        // 7. Cash Out
        const cashOut = entriesInDateRange.filter(e => e.entryType === 'CASH_OUT').reduce((sum, e) => sum + e.amount, 0);

        // 8. AR Aging
        const arAging = { '0-7': 0, '8-30': 0, '31-60': 0, '60+': 0 };
        allObligations.filter(o => o.status !== 'PAID').forEach(o => {
            const dueDate = o.dueDate ? toDateSafe(o.dueDate) : toDateSafe(o.createdAt);
            if (!dueDate) return;
            const daysOverdue = differenceInDays(today, dueDate);
            if (daysOverdue <= 7) arAging['0-7'] += o.balance;
            else if (daysOverdue <= 30) arAging['8-30'] += o.balance;
            else if (daysOverdue <= 60) arAging['31-60'] += o.balance;
            else arAging['60+'] += o.balance;
        });
        
        return { openJobs, completedJobs: completedJobsInRange, atRiskJobs, onTimePercentage, totalRevenue, cashIn, cashOut, arAging };

    }, [filteredData]);


    // --- Chart Data ---
    const chartData = useMemo(() => {
        const months = Array.from({length: 6}).map((_, i) => startOfMonth(subMonths(startOfToday(), 5 - i)));

        // Jobs In vs Closed
        const jobsMonthly = months.map(monthStart => {
            const monthEnd = endOfMonth(monthStart);
            const jobsIn = jobs.filter(j => {
                const d = toDateSafe(j.createdAt);
                return d && d >= monthStart && d <= monthEnd;
            }).length;
            const jobsClosed = jobs.filter(j => {
                const d = toDateSafe(j.closedDate ?? j.updatedAt);
                return d && d >= monthStart && d <= monthEnd && ["CLOSED","DONE"].includes(j.status);
            }).length;
            return { name: format(monthStart, 'MMM'), jobsIn, jobsClosed };
        });
        
        // Backlog by Status
        const backlogByStatus = jobs.filter(j => !["CLOSED", "DONE"].includes(j.status)).reduce((acc, job) => {
            const statusKey = job.status || 'UNKNOWN';
            acc[statusKey] = (acc[statusKey] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const backlogData = Object.entries(backlogByStatus).map(([name, value]) => ({ name, value }));

        // Jobs by Department (in selected range)
        const jobsByDept = filteredData.jobs.reduce((acc, job) => {
            acc[job.department] = (acc[job.department] || 0) + 1;
            return acc;
        }, {} as Record<JobDepartment, number>);
        const deptData = Object.entries(jobsByDept).map(([name, value]) => ({ name, value }));

        // Revenue Trend
        const revenueMonthly = months.map(monthStart => {
            const monthEnd = endOfMonth(monthStart);
            const total = documents.filter(d => {
                const d_date = toDateSafe(d.docDate);
                return d_date && d.status === 'PAID' && ['TAX_INVOICE', 'RECEIPT'].includes(d.docType) && d_date >= monthStart && d_date <= monthEnd
            }).reduce((sum, doc) => sum + doc.grandTotal, 0);
            return { name: format(monthStart, 'MMM'), revenue: total };
        });

        // Cash Flow Trend
        const cashFlowMonthly = months.map(monthStart => {
            const monthEnd = endOfMonth(monthStart);
            const cashIn = entries.filter(e => {
                const d = toDateSafe(e.entryDate);
                return d && (e.entryType === 'CASH_IN' || e.entryType === 'RECEIPT') && d >= monthStart && d <= monthEnd;
            }).reduce((sum, e) => sum + e.amount, 0);
            const cashOut = entries.filter(e => {
                const d = toDateSafe(e.entryDate);
                return d && e.entryType === 'CASH_OUT' && d >= monthStart && d <= monthEnd;
            }).reduce((sum, e) => sum + e.amount, 0);
            return { name: format(monthStart, 'MMM'), cashIn, cashOut };
        });
        
        // AR Aging Bar Chart
        const arAgingData = [
            { name: '0-7 Days', value: cardData.arAging['0-7'] },
            { name: '8-30 Days', value: cardData.arAging['8-30'] },
            { name: '31-60 Days', value: cardData.arAging['31-60'] },
            { name: '60+ Days', value: cardData.arAging['60+'] },
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
            case 'TODAY': setDateRange({ from: today, to: today }); break;
            case 'LAST_7_DAYS': setDateRange({ from: subDays(today, 6), to: today }); break;
            case 'THIS_MONTH': setDateRange({ from: startOfMonth(today), to: endOfMonth(today) }); break;
            case 'LAST_3_MONTHS': setDateRange({ from: startOfMonth(subMonths(today, 2)), to: endOfMonth(today) }); break;
            default: setDateRange({ from: today, to: today });
        }
    };
    
    const renderFinancial = (value: number) => showActualNumbers ? formatCurrency(value) : formatBucket(value);
    
    const CHART_COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE", "#00C49F"];

    return (
        <>
            <PageHeader title="Management Dashboard" description="An overview of business operations and key financial metrics." />
            
            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6 flex flex-wrap items-center gap-4">
                    <Select onValueChange={handleDatePreset} defaultValue="THIS_MONTH">
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="TODAY">Today</SelectItem>
                            <SelectItem value="LAST_7_DAYS">Last 7 Days</SelectItem>
                            <SelectItem value="THIS_MONTH">This Month</SelectItem>
                            <SelectItem value="LAST_3_MONTHS">Last 3 Months</SelectItem>
                        </SelectContent>
                    </Select>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className="w-[280px] justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`: format(dateRange.from, "LLL dd, y")) : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={dateRange} onSelect={setDateRange} /></PopoverContent>
                    </Popover>
                    <Select value={department} onValueChange={(v) => setDepartment(v as any)}>
                        <SelectTrigger className="w-[180px]"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Departments</SelectItem>
                            {JOB_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <div className="flex items-center space-x-2 ml-auto">
                        <Switch id="show-numbers" checked={showActualNumbers} onCheckedChange={setShowActualNumbers} />
                        <Label htmlFor="show-numbers" className="flex items-center gap-2">
                           {showActualNumbers ? <Eye/> : <EyeOff/>}
                           {showActualNumbers ? "Show Full Numbers" : "Show Buckets"}
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/></div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2"/><Skeleton className="h-80"/></div>
              </div>
            ) : error ? <div className="text-destructive"><AlertCircle/> {error}</div> :
            <>
                {/* Executive Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                    <Card><CardHeader><CardTitle>Open Jobs</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{cardData.openJobs.length}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>Completed Jobs</CardTitle><CardDescription>in period</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{cardData.completedJobs.length}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>At-risk / Overdue</CardTitle><CardDescription>{">"} {RISK_DAYS} days</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{cardData.atRiskJobs.length}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>On-time Completion</CardTitle><CardDescription>{"<= "}{RISK_DAYS}{" days"}</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{cardData.onTimePercentage.toFixed(0)}%</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>Revenue (Paid)</CardTitle><TrendingUp className="text-green-500"/></CardHeader><CardContent><p className="text-3xl font-bold">{renderFinancial(cardData.totalRevenue)}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>Cash In</CardTitle><TrendingUp className="text-green-500"/></CardHeader><CardContent><p className="text-3xl font-bold">{renderFinancial(cardData.cashIn)}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>Cash Out</CardTitle><TrendingDown className="text-red-500"/></CardHeader><CardContent><p className="text-3xl font-bold">{renderFinancial(cardData.cashOut)}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>AR Aging (60+ days)</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{renderFinancial(cardData.arAging['60+'])}</p></CardContent></Card>
                </div>
            
                {/* Charts */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="lg:col-span-2"><CardHeader><CardTitle>Jobs In vs Closed (Last 6 Months)</CardTitle></CardHeader><CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData.jobsMonthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="jobsIn" fill="#8884d8" name="Jobs In" /><Bar dataKey="jobsClosed" fill="#82ca9d" name="Jobs Closed" /></BarChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                    <Card><CardHeader><CardTitle>Open Jobs by Status</CardTitle></CardHeader><CardContent>
                         <ResponsiveContainer width="100%" height={300}>
                            <PieChart><Tooltip /><Pie data={chartData.backlogData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8">{chartData.backlogData.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Legend/></PieChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                    <Card><CardHeader><CardTitle>Revenue Trend (Last 6 Months)</CardTitle></CardHeader><CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData.revenueMonthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis tickFormatter={val => `฿${val/1000}k`} /><Tooltip formatter={(val: number) => formatCurrency(val)} /><Legend /><Line type="monotone" dataKey="revenue" stroke="#8884d8" /></LineChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                    <Card><CardHeader><CardTitle>Cash Flow (Last 6 Months)</CardTitle></CardHeader><CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                           <LineChart data={chartData.cashFlowMonthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis tickFormatter={val => `฿${val/1000}k`} /><Tooltip formatter={(val: number) => formatCurrency(val)} /><Legend /><Line type="monotone" dataKey="cashIn" name="Cash In" stroke="#82ca9d" /><Line type="monotone" dataKey="cashOut" name="Cash Out" stroke="#ff8042" /></LineChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                    <Card><CardHeader><CardTitle>AR Aging</CardTitle></CardHeader><CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                             <BarChart data={chartData.arAgingData} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={val => `฿${val/1000}k`} /><YAxis type="category" dataKey="name" width={80} /><Tooltip formatter={(val: number) => formatCurrency(val)} /><Bar dataKey="value" fill="#ffc658" name="Balance" /></BarChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                </div>
            </>
            }
        </>
    );
}
