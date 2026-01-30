"use client";

import { useState, useMemo, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, parseISO, isBefore, isAfter } from "date-fns";
import { collection, query, where, orderBy, addDoc, serverTimestamp, getDocs, onSnapshot } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { cn } from "@/lib/utils";
import { ACCOUNTING_CATEGORIES } from "@/lib/constants";
import type { AccountingAccount, AccountingEntry, Vendor } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlusCircle, Search, CalendarIcon, ChevronsUpDown } from "lucide-react";
import { safeFormat } from "@/lib/date-utils";
import { searchVendors } from "@/firebase/vendors";

type EntryType = 'CASH_IN' | 'CASH_OUT';

const entrySchema = z.object({
  entryDate: z.string().min(1, "กรุณาเลือกวันที่"),
  description: z.string().min(1, "กรุณากรอกรายการ"),
  categoryMain: z.string().min(1, "กรุณาเลือกหมวดหมู่หลัก"),
  categorySub: z.string().optional(),
  amount: z.coerce.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  sourceDocNo: z.string().optional(),
  vendorId: z.string().optional(),
  vendorShortNameSnapshot: z.string().optional(),
  vendorNameSnapshot: z.string().optional(),
});

type EntryFormData = z.infer<typeof entrySchema>;

function VendorCombobox({ allVendors, onSelect }: { allVendors: WithId<Vendor>[], onSelect: (vendor: WithId<Vendor> | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedValue, setSelectedValue] = useState("");

  const filteredVendors = useMemo(() => {
    if (!search) {
      return allVendors;
    }
    const lowerSearch = search.toLowerCase();
    return allVendors.filter(vendor => 
        vendor.shortName.toLowerCase().includes(lowerSearch) ||
        vendor.companyName.toLowerCase().includes(lowerSearch) ||
        vendor.phone?.includes(lowerSearch) ||
        vendor.contactName?.toLowerCase().includes(lowerSearch)
    );
  }, [allVendors, search]);


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          {selectedValue || "เลือกคู่ค้า..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="ค้นหาชื่อย่อ/ชื่อร้าน..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>ไม่พบร้านค้า</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onSelect(null); setSelectedValue(""); setOpen(false); }}>
                -- ไม่มี --
              </CommandItem>
              {filteredVendors.map((vendor) => (
                <CommandItem
                  key={vendor.id}
                  value={`${vendor.shortName} - ${vendor.companyName}`}
                  onSelect={() => {
                    onSelect(vendor);
                    setSelectedValue(`${vendor.shortName} - ${vendor.companyName}`);
                    setOpen(false);
                  }}
                >
                  {vendor.shortName} - {vendor.companyName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddEntryDialog({ entryType, accounts, allVendors, onSaveSuccess }: { entryType: EntryType, accounts: WithId<AccountingAccount>[], allVendors: WithId<Vendor>[], onSaveSuccess: () => void }) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const categories = entryType === 'CASH_IN' ? ACCOUNTING_CATEGORIES.INCOME : ACCOUNTING_CATEGORIES.EXPENSE;
  const mainCategories = Object.keys(categories);
  
  const defaultCategoryMain = entryType === 'CASH_OUT' ? 'ต้นทุนงาน' : 'งานซ่อม';

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      entryDate: format(new Date(), 'yyyy-MM-dd'),
      description: "",
      categoryMain: defaultCategoryMain,
      categorySub: "",
      amount: 0,
      accountId: "",
      paymentMethod: "CASH",
      sourceDocNo: "",
    },
  });
  
  useEffect(() => {
    if (isOpen) {
        form.reset({
            entryDate: format(new Date(), 'yyyy-MM-dd'),
            description: "",
            categoryMain: defaultCategoryMain,
            categorySub: "",
            amount: 0,
            accountId: accounts[0]?.id || "",
            paymentMethod: "CASH",
            sourceDocNo: "",
        });
    }
  }, [isOpen, form, defaultCategoryMain, accounts]);


  const selectedMainCategory = form.watch('categoryMain');
  const subCategories = useMemo(() => {
      if (!selectedMainCategory) return [];
      return (categories as any)[selectedMainCategory] || [];
  }, [selectedMainCategory, categories]);

  const onSubmit = async (values: EntryFormData) => {
    if (!db) return;
    try {
      await addDoc(collection(db, "accountingEntries"), {
        ...values,
        entryType,
        createdAt: serverTimestamp(),
      });
      toast({ title: "บันทึกรายการสำเร็จ" });
      setIsOpen(false);
      onSaveSuccess();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };
  
  const dialogTitle = entryType === 'CASH_IN' ? "บันทึกรับเงิน" : "บันทึกจ่ายเงิน";
  const dialogDescription = entryType === 'CASH_IN' ? "บันทึกรายการเงินเข้าทั่วไป" : "บันทึกรายการค่าใช้จ่ายทั่วไป";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button><PlusCircle className="mr-2" /> {dialogTitle}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="entry-form" className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="entryDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>จำนวนเงิน</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>รายการ</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="categoryMain" render={({ field }) => (<FormItem><FormLabel>หมวดหลัก</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่หลัก..." /></SelectTrigger></FormControl><SelectContent>{mainCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                {subCategories.length > 0 && (
                     <FormField control={form.control} name="categorySub" render={({ field }) => (<FormItem><FormLabel>หมวดย่อย</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกหมวดย่อย..." /></SelectTrigger></FormControl><SelectContent>{subCategories.map((cat: string) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกช่องทาง..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accountId" render={({ field }) => (<FormItem><FormLabel>บัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
             <FormField control={form.control} name="sourceDocNo" render={({ field }) => (<FormItem><FormLabel>อ้างอิงเอกสาร</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            
            <FormItem>
              <FormLabel>คู่ค้า (ถ้ามี)</FormLabel>
                <VendorCombobox
                    allVendors={allVendors}
                    onSelect={(vendor) => {
                        form.setValue('vendorId', vendor?.id);
                        form.setValue('vendorShortNameSnapshot', vendor?.shortName);
                        form.setValue('vendorNameSnapshot', vendor?.companyName);
                    }}
                />
            </FormItem>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>ยกเลิก</Button>
          <Button type="submit" form="entry-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึกรายการ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashbookPageContent() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'out' ? 'out' : 'in';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [searchTerm, setSearchTerm] = useState("");

  const accountsQuery = useMemo(() => db ? query(collection(db, "accountingAccounts"), where("isActive", "==", true)) : null, [db]);
  const { data: accounts, isLoading: isLoadingAccounts } = useCollection<WithId<AccountingAccount>>(accountsQuery);
  
  const [allVendors, setAllVendors] = useState<WithId<Vendor>[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);

  useEffect(() => {
    if (!db) return;
    setIsLoadingVendors(true);
    const q = query(collection(db, "vendors"), orderBy("shortName", "asc"));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const vendorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<Vendor>));
        const activeVendors = vendorsData.filter(v => v.isActive !== false);
        setAllVendors(activeVendors);
        setIsLoadingVendors(false);
      },
      (error) => {
        console.error("Failed to load vendors:", error);
        toast({
          variant: "destructive",
          title: "เกิดข้อผิดพลาด",
          description: "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านค้า หรือการดึงข้อมูลถูกปฏิเสธ",
        });
        setIsLoadingVendors(false);
      }
    );
    return () => unsubscribe();
  }, [db, toast]);

  const entriesQuery = useMemo(() => {
    if (!db) return null;
    if (selectedAccountId === 'ALL') {
      return query(collection(db, "accountingEntries"), orderBy("entryDate", "desc"));
    }
    return query(collection(db, "accountingEntries"), where("accountId", "==", selectedAccountId), orderBy("entryDate", "desc"));
  }, [db, selectedAccountId]);

  const { data: entries, isLoading: isLoadingEntries } = useCollection<WithId<AccountingEntry>>(entriesQuery);
  
  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    let data = entries;

    if (dateRange?.from) {
      data = data.filter(entry => !isBefore(parseISO(entry.entryDate), dateRange.from!));
    }
    if (dateRange?.to) {
      data = data.filter(entry => !isAfter(parseISO(entry.entryDate), dateRange.to!));
    }
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      data = data.filter(entry => 
        entry.description?.toLowerCase().includes(lowerSearch) || 
        entry.sourceDocNo?.toLowerCase().includes(lowerSearch) || 
        entry.customerNameSnapshot?.toLowerCase().includes(lowerSearch) ||
        entry.vendorNameSnapshot?.toLowerCase().includes(lowerSearch) ||
        entry.vendorShortNameSnapshot?.toLowerCase().includes(lowerSearch) ||
        entry.counterpartyNameSnapshot?.toLowerCase().includes(lowerSearch)
      );
    }
    
    return data;
  }, [entries, dateRange, searchTerm]);

  const formatCurrency = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const renderCategory = (entry: WithId<AccountingEntry>) => {
    if (entry.categoryMain) {
        return entry.categorySub ? `${entry.categoryMain} > ${entry.categorySub}` : entry.categoryMain;
    }
    if (entry.category) {
        return entry.category;
    }
    return '-';
  };

  if (!profile) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  if (!hasPermission) return <PageHeader title="ไม่มีสิทธิ์เข้าถึง" description="หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น" />;
  
  const isLoading = isLoadingAccounts || isLoadingEntries || isLoadingVendors;

  return (
    <>
      <PageHeader title="รับ–จ่ายเงิน" description="บันทึกรายการเงินเข้า–ออก และเลือกบัญชีเงินสด/ธนาคาร" />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="in">เงินเข้า</TabsTrigger>
            <TabsTrigger value="out">เงินออก</TabsTrigger>
          </TabsList>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-full md:w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ALL">ทุกบัญชี</SelectItem>{accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")) : <span>เลือกช่วงวันที่</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/></PopoverContent>
            </Popover>
          </div>
        </div>

        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="relative w-full md:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="ค้นหาจากรายการ, เลขอ้างอิง, ชื่อคู่ค้า..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                    </div>
                    {accounts && <AddEntryDialog entryType={activeTab === 'in' ? 'CASH_IN' : 'CASH_OUT'} accounts={accounts} allVendors={allVendors} onSaveSuccess={() => {}} />}
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>วันที่</TableHead>
                            <TableHead>รายการ</TableHead>
                            <TableHead>คู่ค้า</TableHead>
                            <TableHead>หมวดหมู่</TableHead>
                            <TableHead>อ้างอิง</TableHead>
                            <TableHead>เงินเข้า</TableHead>
                            <TableHead>เงินออก</TableHead>
                            <TableHead>บัญชี</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
                        ) : filteredEntries.filter(e => activeTab === 'in' ? (e.entryType === 'RECEIPT' || e.entryType === 'CASH_IN') : e.entryType === 'CASH_OUT').length > 0 ? (
                            filteredEntries.filter(e => activeTab === 'in' ? (e.entryType === 'RECEIPT' || e.entryType === 'CASH_IN') : e.entryType === 'CASH_OUT').map(entry => {
                                const accountName = accounts?.find(a => a.id === entry.accountId)?.name || entry.accountId;
                                const counterparty = entry.vendorShortNameSnapshot || entry.customerNameSnapshot || entry.counterpartyNameSnapshot || '-';
                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell>{safeFormat(parseISO(entry.entryDate), 'dd/MM/yy')}</TableCell>
                                        <TableCell>{entry.description || `รับเงินจาก ${entry.customerNameSnapshot}`}</TableCell>
                                        <TableCell>{counterparty}</TableCell>
                                        <TableCell className="text-xs max-w-[150px] truncate">{renderCategory(entry)}</TableCell>
                                        <TableCell>{entry.sourceDocNo || '-'}</TableCell>
                                        <TableCell className="text-right text-green-600">{activeTab === 'in' ? formatCurrency(entry.amount) : ''}</TableCell>
                                        <TableCell className="text-right text-destructive">{activeTab === 'out' ? formatCurrency(entry.amount) : ''}</TableCell>
                                        <TableCell>{accountName}</TableCell>
                                    </TableRow>
                                )
                            })
                        ) : (
                            <TableRow><TableCell colSpan={8} className="h-24 text-center">ไม่พบรายการ</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </Tabs>
    </>
  );
}

export default function CashbookPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
            <CashbookPageContent />
        </Suspense>
    );
}
