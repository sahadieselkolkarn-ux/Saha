"use client";

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, isBefore, parseISO, isAfter } from 'date-fns';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Search, ArrowLeft, CalendarIcon } from 'lucide-react';
import { WithId } from '@/firebase/firestore/use-collection';
import { AccountingAccount, AccountingEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { safeFormat } from '@/lib/date-utils';

const formatCurrency = (value: number) => {
    return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AccountLedgerPage() {
    const { db } = useFirebase();
    const { profile } = useAuth();
    const params = useParams();
    const router = useRouter();
    const accountId = params.accountId as string;

    const [account, setAccount] = useState<WithId<AccountingAccount> | null>(null);
    const [entries, setEntries] = useState<WithId<AccountingEntry>[]>([]);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

    useEffect(() => {
        if (!db || !accountId) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Query without ordering to avoid needing a composite index
                const entriesQuery = query(collection(db, 'accountingEntries'), where('accountId', '==', accountId));
                const accountDocRef = doc(db, 'accountingAccounts', accountId);

                const [accountSnap, entriesSnap] = await Promise.all([
                    getDoc(accountDocRef),
                    getDocs(entriesQuery),
                ]);

                if (!accountSnap.exists()) {
                    throw new Error("ไม่พบบัญชีที่ระบุ");
                }
                setAccount({ id: accountSnap.id, ...accountSnap.data() } as WithId<AccountingAccount>);
                
                const entriesData = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<AccountingEntry>));
                setEntries(entriesData);

            } catch (e: any) {
                console.error("Failed to load ledger data:", e);
                setError(e.message || "ไม่สามารถโหลดสมุดบัญชีได้");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [db, accountId]);

    const processedData = useMemo(() => {
        if (!account) return { items: [], totals: { totalIncome: 0, totalExpense: 0, periodEndBalance: 0 }, periodStartingBalance: 0 };
    
        // Client-side sorting
        const sortedAllEntries = [...entries].sort((a, b) => {
            const dateA = parseISO(a.entryDate).getTime();
            const dateB = parseISO(b.entryDate).getTime();
            if (dateA !== dateB) return dateA - dateB;
            if (a.createdAt && b.createdAt && a.createdAt.toMillis && b.createdAt.toMillis) {
              return a.createdAt.toMillis() - b.createdAt.toMillis();
            }
            return 0;
        });
    
        const openingBalanceDate = account.openingBalanceDate ? parseISO(account.openingBalanceDate) : new Date(0);
    
        let periodStartingBalance = account.openingBalance ?? 0;
        
        // Calculate starting balance based on entries before the selected date range
        if (dateRange?.from) {
             sortedAllEntries.forEach(entry => {
                const entryDate = parseISO(entry.entryDate);
                if (isAfter(entryDate, openingBalanceDate) && isBefore(entryDate, dateRange.from!)) {
                    if (entry.entryType === 'RECEIPT' || entry.entryType === 'CASH_IN') {
                        periodStartingBalance += entry.amount;
                    } else if (entry.entryType === 'CASH_OUT') {
                        periodStartingBalance -= entry.amount;
                    }
                }
            });
        }
    
        // Client-side filtering
        const visibleEntries = sortedAllEntries.filter(entry => {
            const entryDate = parseISO(entry.entryDate);
            const isInRange = dateRange?.from && dateRange?.to ? (entryDate >= dateRange.from && entryDate <= dateRange.to) : true;
            if (!isInRange) return false;
    
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                const match = entry.sourceDocNo?.toLowerCase().includes(lowerSearch) ||
                              entry.description?.toLowerCase().includes(lowerSearch) ||
                              entry.customerNameSnapshot?.toLowerCase().includes(lowerSearch) ||
                              entry.vendorNameSnapshot?.toLowerCase().includes(lowerSearch) ||
                              entry.vendorShortNameSnapshot?.toLowerCase().includes(lowerSearch) ||
                              entry.counterpartyNameSnapshot?.toLowerCase().includes(lowerSearch);
                if (!match) return false;
            }
            return true;
        });
    
        let runningBalance = periodStartingBalance;
        let totalIncome = 0;
        let totalExpense = 0;
    
        const itemsWithBalance = visibleEntries.map(entry => {
            let income = 0;
            let expense = 0;
            let description = entry.description || '';

            if (entry.entryType === 'RECEIPT' || entry.entryType === 'CASH_IN') {
                income = entry.amount;
                if (entry.entryType === 'RECEIPT' && entry.customerNameSnapshot) {
                    description = `รับเงินจาก ${entry.customerNameSnapshot}`;
                }
            } else if (entry.entryType === 'CASH_OUT') {
                expense = entry.amount;
            }
    
            runningBalance += income - expense;
            totalIncome += income;
            totalExpense += expense;
    
            return {
                ...entry,
                income,
                expense,
                balance: runningBalance,
                displayDescription: description,
            };
        });
    
        return {
            periodStartingBalance,
            items: itemsWithBalance,
            totals: {
                totalIncome,
                totalExpense,
                periodEndBalance: runningBalance,
            },
        };
    }, [account, entries, dateRange, searchTerm]);

    if (!profile) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (!hasPermission) return <PageHeader title="ไม่มีสิทธิ์เข้าถึง" description="หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น" />;
    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (error) return <PageHeader title="เกิดข้อผิดพลาด" description={error} />;
    if (!account) return <PageHeader title="ไม่พบบัญชี" />;

    return (
        <>
            <PageHeader title={account.name} description={`รายการเคลื่อนไหวบัญชี (${account.type})`}>
                <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2" /> กลับ</Button>
            </PageHeader>
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle>ยอดยกมา: {formatCurrency(account.openingBalance ?? 0)} บาท</CardTitle>
                            <CardDescription>ณ วันที่: {safeFormat(account.openingBalanceDate ? parseISO(account.openingBalanceDate) : null, 'dd MMM yyyy')}</CardDescription>
                        </div>
                        <div className="flex flex-col md:flex-row gap-2">
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>เลือกช่วงวันที่</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/>
                                </PopoverContent>
                            </Popover>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                placeholder="ค้นหาเลขที่เอกสาร, ชื่อ..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>วันที่</TableHead>
                                <TableHead>รายการ</TableHead>
                                <TableHead>อ้างอิง</TableHead>
                                <TableHead className="text-right">เงินเข้า</TableHead>
                                <TableHead className="text-right">เงินออก</TableHead>
                                <TableHead className="text-right">คงเหลือ</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="font-semibold bg-muted/50">
                                <TableCell colSpan={5}>ยอดยกมา ณ วันที่ {dateRange?.from ? format(dateRange.from, 'dd MMM yyyy') : '...'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(processedData.periodStartingBalance)}</TableCell>
                            </TableRow>
                            {processedData.items.length > 0 ? (
                                processedData.items.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{safeFormat(parseISO(item.entryDate), 'dd/MM/yy')}</TableCell>
                                        <TableCell>{item.displayDescription}</TableCell>
                                        <TableCell>{item.sourceDocNo}</TableCell>
                                        <TableCell className="text-right text-green-600">{item.income > 0 ? formatCurrency(item.income) : ''}</TableCell>
                                        <TableCell className="text-right text-destructive">{item.expense > 0 ? formatCurrency(item.expense) : ''}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.balance)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">ไม่พบรายการในช่วงวันที่ที่เลือก</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                         <TableFooter>
                            <TableRow className="font-bold text-base bg-muted/50 hover:bg-muted/50">
                                <TableCell colSpan={3}>รวม</TableCell>
                                <TableCell className="text-right">{formatCurrency(processedData.totals.totalIncome)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(processedData.totals.totalExpense)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(processedData.totals.periodEndBalance)}</TableCell>
                            </TableRow>
                         </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </>
    );
}
