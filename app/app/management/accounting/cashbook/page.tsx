"use client";

import { useState, useMemo, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, parseISO, isBefore, isAfter, subMonths, addMonths } from "date-fns";
import { collection, query, where, orderBy, addDoc, serverTimestamp, getDocs, onSnapshot, doc, writeBatch, runTransaction, increment, updateDoc, deleteDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useFirebase } from "@/firebase/client-provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import type { WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import { ACCOUNTING_CATEGORIES } from "@/lib/constants";
import type { AccountingAccount, AccountingEntry, Vendor, StoreSettings, Document as DocumentType } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, PlusCircle, Search, CalendarIcon, ChevronsUpDown, AlertCircle, FileText, Printer, CheckCircle2, MoreHorizontal, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { safeFormat } from "@/lib/date-utils";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type EntryType = 'CASH_IN' | 'CASH_OUT' | 'RECEIPT';

const entrySchema = z.object({
  entryType: z.enum(['CASH_IN', 'CASH_OUT'], { required_error: "กรุณาเลือกประเภทรายการ" }),
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
  billType: z.enum(["NO_BILL", "NO_TAX_INVOICE", "TAX_INVOICE"]),
  vatRate: z.coerce.number().optional(),
  vatAmount: z.coerce.number().optional(),
  netAmount: z.coerce.number().optional(),
  withholdingEnabled: z.boolean().default(false),
  withholdingPercent: z.coerce.number().optional(),
  withholdingAmount: z.coerce.number().optional(),
}).superRefine((data, ctx) => {
  if (data.entryType === 'CASH_OUT') {
    if (data.billType === 'TAX_INVOICE') {
      if (data.netAmount === undefined || data.netAmount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "กรุณาระบุยอดก่อน VAT",
          path: ["netAmount"],
        });
      }
      if (data.vatRate === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "กรุณาระบุอัตรา VAT",
          path: ["vatRate"],
        });
      }
    }

    if (data.withholdingEnabled) {
      if (!data.withholdingPercent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "กรุณาระบุอัตราหัก ณ ที่จ่าย",
          path: ["withholdingPercent"],
        });
      }
      if (data.withholdingAmount === undefined || data.withholdingAmount < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "กรุณาระบุจำนวนภาษีที่หัก",
          path: ["withholdingAmount"],
        });
      }
    }
  }
});

type EntryFormData = z.infer<typeof entrySchema>;

function VendorCombobox({ allVendors, selectedId, onSelect, disabled }: { allVendors: WithId<Vendor>[], selectedId?: string, onSelect: (vendor: WithId<Vendor> | null) => void, disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const selectedVendor = useMemo(() => allVendors.find(v => v.id === selectedId), [allVendors, selectedId]);
  const selectedValue = selectedVendor ? `${selectedVendor.shortName} - ${selectedVendor.companyName}` : "";

  const filteredVendors = useMemo(() => {
    if (!search) return allVendors;
    const lowerSearch = search.toLowerCase();
    return allVendors.filter(vendor => 
        vendor.shortName.toLowerCase().includes(lowerSearch) ||
        vendor.companyName.toLowerCase().includes(lowerSearch) ||
        vendor.phone?.includes(lowerSearch)
    );
  }, [allVendors, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between overflow-hidden text-sm" disabled={disabled}>
          <span className="truncate">{selectedValue || "เลือกคู่ค้า..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="ค้นหาชื่อย่อ/ชื่อร้าน..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>ไม่พบร้านค้า</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onSelect(null); setOpen(false); }}>-- ไม่มี --</CommandItem>
              {filteredVendors.map((vendor) => (
                <CommandItem key={vendor.id} value={`${vendor.shortName} - ${vendor.companyName}`} onSelect={() => { onSelect(vendor); setOpen(false); }}>
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

function EntryFormDialog({ 
  accounts, 
  allVendors, 
  onSaveSuccess, 
  editingEntry,
  isOpen,
  onOpenChange
}: { 
  accounts: WithId<AccountingAccount>[], 
  allVendors: WithId<Vendor>[], 
  onSaveSuccess: () => void,
  editingEntry?: WithId<AccountingEntry> | null,
  isOpen: boolean,
  onOpenChange: (open: boolean) => void
}) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [successDocId, setSuccessDocId] = useState<string | null>(null);

  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const { data: storeSettings } = useDoc<StoreSettings>(storeSettingsRef);

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      entryType: 'CASH_IN',
      entryDate: format(new Date(), 'yyyy-MM-dd'),
      description: "",
      categoryMain: 'งานซ่อม',
      categorySub: "",
      amount: 0,
      accountId: "",
      paymentMethod: "CASH",
      sourceDocNo: "",
      billType: "NO_TAX_INVOICE",
      vatRate: 7,
      vatAmount: 0,
      netAmount: 0,
      withholdingEnabled: false,
      withholdingPercent: 3,
      withholdingAmount: 0,
    },
  });
  
  const watchedEntryType = form.watch('entryType');
  const watchedBillType = form.watch('billType');
  const watchedNetAmount = form.watch('netAmount') || 0;
  const watchedVatRate = form.watch('vatRate') || 0;
  const watchedWhtEnabled = form.watch('withholdingEnabled');
  const watchedWhtPercent = form.watch('withholdingPercent') || 0;
  const watchedAmount = form.watch('amount') || 0;

  const categories = watchedEntryType === 'CASH_IN' ? ACCOUNTING_CATEGORIES.INCOME : ACCOUNTING_CATEGORIES.EXPENSE;
  const mainCategories = Object.keys(categories);

  useEffect(() => {
    if (watchedEntryType !== 'CASH_OUT') return;

    if (watchedBillType === 'TAX_INVOICE') {
      const vatAmount = Math.round(watchedNetAmount * (watchedVatRate / 100) * 100) / 100;
      const totalAmount = Math.round((watchedNetAmount + vatAmount) * 100) / 100;
      const whtAmount = watchedWhtEnabled ? Math.round(watchedNetAmount * (watchedWhtPercent / 100) * 100) / 100 : 0;
      
      form.setValue('vatAmount', vatAmount);
      form.setValue('amount', totalAmount);
      form.setValue('withholdingAmount', whtAmount);
    } else {
      const whtAmount = watchedWhtEnabled ? Math.round(watchedAmount * (watchedWhtPercent / 100) * 100) / 100 : 0;
      form.setValue('vatAmount', 0);
      form.setValue('netAmount', watchedAmount);
      form.setValue('withholdingAmount', whtAmount);
    }
  }, [watchedNetAmount, watchedVatRate, watchedWhtEnabled, watchedWhtPercent, watchedBillType, watchedAmount, form, watchedEntryType]);

  useEffect(() => {
    if (isOpen) {
        setSuccessDocId(null);
        if (editingEntry) {
            form.reset({
                entryType: (editingEntry.entryType as any) || 'CASH_IN',
                entryDate: editingEntry.entryDate,
                description: editingEntry.description || "",
                categoryMain: editingEntry.categoryMain || (editingEntry.entryType === 'CASH_OUT' ? 'ต้นทุนงาน' : 'งานซ่อม'),
                categorySub: editingEntry.categorySub || "",
                amount: editingEntry.grossAmount || editingEntry.amount,
                accountId: editingEntry.accountId,
                paymentMethod: (editingEntry.paymentMethod as any) || "CASH",
                sourceDocNo: editingEntry.sourceDocNo || "",
                billType: (editingEntry.billType as any) || "NO_TAX_INVOICE",
                vatRate: editingEntry.vatRate ?? 7,
                vatAmount: editingEntry.vatAmount || 0,
                netAmount: editingEntry.netAmount || 0,
                withholdingEnabled: editingEntry.withholdingEnabled || false,
                withholdingPercent: editingEntry.withholdingPercent || 3,
                withholdingAmount: editingEntry.withholdingAmount || 0,
                vendorId: editingEntry.vendorId || "",
                vendorShortNameSnapshot: editingEntry.vendorShortNameSnapshot || "",
                vendorNameSnapshot: editingEntry.vendorNameSnapshot || "",
            });
        } else {
            form.reset({
                entryType: 'CASH_IN',
                entryDate: format(new Date(), 'yyyy-MM-dd'),
                description: "",
                categoryMain: 'งานซ่อม',
                categorySub: "",
                amount: 0,
                accountId: accounts[0]?.id || "",
                paymentMethod: "CASH",
                sourceDocNo: "",
                billType: "NO_TAX_INVOICE",
                vatRate: 7,
                vatAmount: 0,
                netAmount: 0,
                withholdingEnabled: false,
                withholdingPercent: 3,
                withholdingAmount: 0,
            });
        }
    }
  }, [isOpen, form, accounts, editingEntry]);

  const selectedMainCategory = form.watch('categoryMain');
  const subCategories = useMemo(() => {
      if (!selectedMainCategory) return [];
      return (categories as any)[selectedMainCategory] || [];
  }, [selectedMainCategory, categories]);

  const onSubmit = async (values: EntryFormData) => {
    if (!db || !profile) return;

    if (values.entryType === 'CASH_OUT' && values.withholdingEnabled) {
        if (!values.vendorId) {
            toast({ variant: 'destructive', title: "กรุณาเลือกร้านค้า", description: "ต้องระบุคู่ค้าเพื่อออกหนังสือรับรองหัก ณ ที่จ่าย" });
            return;
        }
        const selectedVendor = allVendors.find(v => v.id === values.vendorId);
        if (!selectedVendor || !selectedVendor.taxId || !selectedVendor.address) {
            toast({ variant: 'destructive', title: "ข้อมูลคู่ค้าไม่ครบถ้วน", description: "ร้านค้าที่เลือกต้องมีเลขผู้เสียภาษีและที่อยู่เพื่อออกใบหัก ณ ที่จ่าย" });
            return;
        }
        if (!storeSettings || !storeSettings.taxId) {
            toast({ variant: 'destructive', title: "ข้อมูลร้านค้าไม่ครบถ้วน", description: "กรุณาตั้งค่าข้อมูลภาษีของร้านที่หน้าตั้งค่าระบบก่อน" });
            return;
        }
    }

    try {
      if (editingEntry) {
          const entryRef = doc(db, 'accountingEntries', editingEntry.id);
          const actualCashAmount = values.amount - (values.withholdingAmount || 0);
          await updateDoc(entryRef, sanitizeForFirestore({
              ...values,
              amount: actualCashAmount,
              grossAmount: values.amount,
              updatedAt: serverTimestamp(),
          }));
          toast({ title: "อัปเดตรายการสำเร็จ" });
          onOpenChange(false);
          onSaveSuccess();
          return;
      }

      await runTransaction(db, async (transaction) => {
        let withholdingTaxDocId = "";

        if (values.entryType === 'CASH_OUT' && values.withholdingEnabled && values.vendorId && storeSettings) {
            const year = new Date(values.entryDate).getFullYear();
            const counterRef = doc(db, 'documentCounters', String(year));
            const docSettingsRef = doc(db, 'settings', 'documents');
            
            const [counterSnap, settingsSnap] = await Promise.all([
                transaction.get(counterRef),
                transaction.get(docSettingsRef)
            ]);
            
            const settingsData = settingsSnap.exists() ? settingsSnap.data() as any : {};
            const prefix = settingsData?.withholdingTaxPrefix || 'WHT';
            
            let currentCounters = counterSnap.exists() ? counterSnap.data() as any : { year };
            const newCount = (currentCounters.withholdingTax || 0) + 1;
            const docNo = `${prefix}${year}-${String(newCount).padStart(4, '0')}`;
            
            const whtDocRef = doc(collection(db, 'documents'));
            withholdingTaxDocId = whtDocRef.id;
            
            const selectedVendor = allVendors.find(v => v.id === values.vendorId)!;
            const paidAmountGross = values.billType === 'TAX_INVOICE' ? (values.netAmount || 0) : values.amount;
            
            const whtData: any = sanitizeForFirestore({
                id: withholdingTaxDocId,
                docType: 'WITHHOLDING_TAX',
                docNo,
                docDate: values.entryDate,
                payerSnapshot: { 
                    name: storeSettings.taxName || "", 
                    address: storeSettings.taxAddress || "", 
                    taxId: storeSettings.taxId || "", 
                    branch: storeSettings.branch || "00000" 
                },
                payeeSnapshot: { 
                    name: selectedVendor.companyName, 
                    address: selectedVendor.address || "", 
                    taxId: selectedVendor.taxId || "" 
                },
                vendorId: values.vendorId,
                paidMonth: parseInt(values.entryDate.split('-')[1]),
                paidYear: parseInt(values.entryDate.split('-')[0]),
                incomeTypeCode: 'ITEM5', 
                paidAmountGross,
                withholdingPercent: values.withholdingPercent || 3,
                withholdingAmount: values.withholdingAmount || 0,
                paidAmountNet: paidAmountGross - (values.withholdingAmount || 0),
                status: 'ISSUED',
                senderName: profile.displayName,
                receiverName: selectedVendor.companyName,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            
            transaction.set(whtDocRef, whtData);
            transaction.update(counterRef, { withholdingTax: newCount });
        }

        const entryRef = doc(collection(db, 'accountingEntries'));
        const actualCashAmount = values.amount - (values.withholdingAmount || 0);
        
        transaction.set(entryRef, sanitizeForFirestore({
            ...values,
            amount: actualCashAmount,
            grossAmount: values.amount,
            withholdingTaxDocId,
            createdAt: serverTimestamp(),
        }));
        
        return withholdingTaxDocId;
      }).then((docId) => {
          toast({ title: "บันทึกรายการสำเร็จ" });
          if (docId) {
              setSuccessDocId(docId);
          } else {
              onOpenChange(false);
              onSaveSuccess();
          }
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };
  
  const dialogTitle = editingEntry ? "แก้ไขรายการ" : "บันทึกรายการรับ-จ่าย";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {successDocId ? (
            <div className="p-12 text-center space-y-6">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold">บันทึกสำเร็จ</h3>
                    <p className="text-muted-foreground">รายการบัญชีและหนังสือหัก ณ ที่จ่ายถูกสร้างแล้ว</p>
                </div>
                <div className="flex flex-col gap-2">
                    <Button asChild size="lg" className="w-full">
                        <Link href={`/app/management/accounting/documents/withholding-tax/${successDocId}/print`} target="_blank">
                            <Printer className="mr-2 h-5 w-5" /> พิมพ์หนังสือรับรอง (50 ทวิ)
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={() => { onOpenChange(false); onSaveSuccess(); }}>ปิดหน้าต่าง</Button>
                </div>
            </div>
        ) : (
            <>
            <DialogHeader className="p-6 pb-0">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>บันทึกรายการเงินเข้าหรือเงินออกทั่วไปเพื่อกระทบยอดบัญชี</DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} id="entry-form" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <FormField control={form.control} name="entryType" render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>ประเภทรายการ</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={(v) => {
                                    field.onChange(v);
                                    form.setValue('categoryMain', v === 'CASH_OUT' ? 'ต้นทุนงาน' : 'งานซ่อม');
                                }} value={field.value} className="flex gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="CASH_IN" id="in" />
                                        <Label htmlFor="in" className="font-semibold text-green-600">เงินเข้า (Income)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="CASH_OUT" id="out" />
                                        <Label htmlFor="out" className="font-semibold text-destructive">เงินออก (Expense)</Label>
                                    </div>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="entryDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>รายการ</FormLabel><FormControl><Input placeholder="ระบุรายละเอียดรายการ" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="categoryMain" render={({ field }) => (
                            <FormItem><FormLabel>หมวดหลัก</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{mainCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></FormItem>
                        )} />
                        {subCategories.length > 0 && (
                            <FormField control={form.control} name="categorySub" render={({ field }) => (
                                <FormItem><FormLabel>หมวดย่อย</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{subCategories.map((cat: string) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></FormItem>
                            )} />
                        )}
                    </div>
                    
                    {watchedEntryType === 'CASH_OUT' && (
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-dashed">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold flex items-center gap-2 text-primary"><AlertCircle className="h-4 w-4" /> รายละเอียดภาษีและบิล</h4>
                                <FormField control={form.control} name="withholdingEnabled" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="text-xs cursor-pointer">หัก ณ ที่จ่าย</FormLabel>
                                    </FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="billType" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>ประเภทบิล</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="NO_BILL">ไม่มีบิล (NO_BILL)</SelectItem>
                                                <SelectItem value="NO_TAX_INVOICE">บิลเงินสด (NO_TAX_INVOICE)</SelectItem>
                                                <SelectItem value="TAX_INVOICE">ใบกำกับภาษี (TAX_INVOICE)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )} />
                                {watchedBillType === 'TAX_INVOICE' && (
                                    <FormField control={form.control} name="vatRate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>VAT (%)</FormLabel>
                                            <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString()}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value="0">0%</SelectItem>
                                                    <SelectItem value="7">7%</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                )}
                            </div>
                            {watchedBillType === 'TAX_INVOICE' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="netAmount" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">ยอดก่อน VAT (Net)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormItem>
                                        <FormLabel>จำนวน VAT</FormLabel>
                                        <FormControl><Input type="number" value={form.watch('vatAmount')} disabled className="bg-muted font-mono" /></FormControl>
                                    </FormItem>
                                </div>
                            )}
                            {watchedWhtEnabled && (
                                <div className="space-y-3 border-t pt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="withholdingPercent" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>อัตราหัก (%)</FormLabel>
                                                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString()}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="1">1% (ขนส่ง)</SelectItem>
                                                        <SelectItem value="3">3% (บริการ)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="withholdingAmount" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>ยอดภาษีที่หัก (WHT)</FormLabel>
                                                <FormControl><Input type="number" {...field} disabled className="bg-muted font-mono" /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 items-end">
                        <FormField control={form.control} name="amount" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-bold text-primary">จำนวนเงิน (ยอดรวม{watchedBillType === 'TAX_INVOICE' ? 'สุทธิ' : ''})</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        step="0.01" 
                                        {...field} 
                                        className={cn("text-lg font-bold", (watchedEntryType === 'CASH_OUT' && watchedBillType === 'TAX_INVOICE') && "bg-muted")} 
                                        readOnly={watchedEntryType === 'CASH_OUT' && watchedBillType === 'TAX_INVOICE'} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="accountId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{watchedEntryType === 'CASH_IN' ? 'รับเงินเข้าบัญชี' : 'จ่ายออกจากบัญชี'}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl>
                                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>

                    {watchedEntryType === 'CASH_OUT' && watchedWhtEnabled && (
                        <div className="flex justify-end pr-2">
                            <span className="text-sm font-semibold text-destructive">
                                ยอดจ่ายจริง (หัก WHT แล้ว): {(form.watch('amount') - (form.watch('withholdingAmount') || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="sourceDocNo" render={({ field }) => (
                            <FormItem>
                                <FormLabel>เลขที่บิล/อ้างอิง</FormLabel>
                                <FormControl><Input {...field} placeholder="เช่น เลขที่บิลร้านค้า" /></FormControl>
                            </FormItem>
                        )} />
                        {watchedEntryType === 'CASH_OUT' && (
                            <FormItem>
                                <FormLabel>คู่ค้า (Vendor)</FormLabel>
                                <VendorCombobox 
                                    allVendors={allVendors} 
                                    selectedId={form.watch('vendorId')} 
                                    onSelect={(vendor) => { 
                                        form.setValue('vendorId', vendor?.id); 
                                        form.setValue('vendorShortNameSnapshot', vendor?.shortName); 
                                        form.setValue('vendorNameSnapshot', vendor?.companyName); 
                                    }} 
                                />
                            </FormItem>
                        )}
                    </div>
                </form>
            </Form>
            <DialogFooter className="p-6 border-t bg-muted/50">
                <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
                <Button type="submit" form="entry-form" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingEntry ? "บันทึกการแก้ไข" : (watchedWhtEnabled ? "บันทึกและออก 50 ทวิ" : "บันทึกรายการ")}
                </Button>
            </DialogFooter>
            </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CashbookPageContent() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WithId<AccountingEntry> | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<WithId<AccountingEntry> | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const dateRange = useMemo(() => ({
    from: startOfMonth(currentMonth),
    to: endOfMonth(currentMonth)
  }), [currentMonth]);

  const accountsQuery = useMemo(() => db ? query(collection(db, "accountingAccounts"), where("isActive", "==", true)) : null, [db]);
  const { data: accounts, isLoading: isLoadingAccounts } = useCollection<AccountingAccount>(accountsQuery);
  
  const [allVendors, setAllVendors] = useState<WithId<Vendor>[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);

  useEffect(() => {
    if (!db) return;
    setIsLoadingVendors(true);
    const q = query(collection(db, "vendors"), orderBy("shortName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setAllVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<Vendor>)).filter(v => v.isActive !== false));
        setIsLoadingVendors(false);
    }, (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message });
        setIsLoadingVendors(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const entriesQuery = useMemo(() => {
    if (!db) return null;
    const constraints = [orderBy("entryDate", "desc")];
    if (selectedAccountId !== 'ALL') constraints.push(where("accountId", "==", selectedAccountId));
    return query(collection(db, "accountingEntries"), ...constraints);
  }, [db, selectedAccountId]);

  const { data: entries, isLoading: isLoadingEntries } = useCollection<AccountingEntry>(entriesQuery);
  
  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);
  const isAdmin = useMemo(() => profile?.role === 'ADMIN', [profile]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    let data = entries;
    if (dateRange?.from) data = data.filter(entry => !isBefore(parseISO(entry.entryDate), dateRange.from!));
    if (dateRange?.to) data = data.filter(entry => !isAfter(parseISO(entry.entryDate), dateRange.to!));
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      data = data.filter(entry => 
        entry.description?.toLowerCase().includes(lowerSearch) || 
        entry.sourceDocNo?.toLowerCase().includes(lowerSearch) || 
        entry.vendorNameSnapshot?.toLowerCase().includes(lowerSearch) ||
        entry.customerNameSnapshot?.toLowerCase().includes(lowerSearch)
      );
    }
    return data;
  }, [entries, dateRange, searchTerm]);

  const handleDelete = async () => {
    if (!db || !deletingEntry) return;
    setIsActionLoading(true);
    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'accountingEntries', deletingEntry.id));
        
        if (deletingEntry.withholdingTaxDocId) {
            batch.update(doc(db, 'documents', deletingEntry.withholdingTaxDocId), {
                status: 'CANCELLED',
                updatedAt: serverTimestamp()
            });
        }
        
        await batch.commit();
        toast({ title: "ลบรายการเรียบร้อยแล้ว" });
        setDeletingEntry(null);
    } catch(e: any) {
        toast({ variant: 'destructive', title: "ลบไม่สำเร็จ", description: e.message });
    } finally {
        setIsActionLoading(false);
    }
  };

  if (!profile) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  
  if (!hasPermission) {
    return (
      <div className="w-full">
        <PageHeader title="รับ–จ่ายเงิน" />
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น</CardDescription>
            </CardHeader>
        </Card>
      </div>
    );
  }
  
  const isLoading = isLoadingAccounts || isLoadingEntries || isLoadingVendors;

  return (
    <>
      <PageHeader title="รับ–จ่ายเงิน" description="รายการเคลื่อนไหวเงินสดและธนาคารประจำเดือน" />
      
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft/></Button>
          <div className="font-bold text-center w-36 text-lg">{format(currentMonth, 'MMMM yyyy')}</div>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}><ChevronRight/></Button>
          <Separator orientation="vertical" className="h-8 mx-2" />
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ทุกบัญชี</SelectItem>
              {accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="w-full md:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" /> บันทึกรายการรับ-จ่าย
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาจากรายการ, ร้านค้า, ลูกค้า..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">วันที่</TableHead>
                  <TableHead>รายการ</TableHead>
                  <TableHead>คู่ค้า/ลูกค้า</TableHead>
                  <TableHead className="text-right">เงินเข้า</TableHead>
                  <TableHead className="text-right">เงินออก</TableHead>
                  <TableHead>บัญชี</TableHead>
                  <TableHead className="text-right w-[100px]">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                ) : filteredEntries.length > 0 ? (
                  filteredEntries.map(entry => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground">{safeFormat(parseISO(entry.entryDate), 'dd/MM/yy')}</TableCell>
                      <TableCell className="font-medium">
                        {entry.description}
                        {entry.entryType === 'RECEIPT' && <Badge variant="outline" className="ml-2 text-[10px]">Payment</Badge>}
                      </TableCell>
                      <TableCell>{entry.vendorShortNameSnapshot || entry.customerNameSnapshot || '-'}</TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">
                        {entry.entryType !== 'CASH_OUT' ? entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                      </TableCell>
                      <TableCell className="text-right text-destructive font-semibold">
                        {entry.entryType === 'CASH_OUT' ? entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                      </TableCell>
                      <TableCell className="text-xs">{accounts?.find(a => a.id === entry.accountId)?.name || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {entry.withholdingTaxDocId && (
                            <Button asChild variant="ghost" size="icon" title="พิมพ์หนังสือรับรอง">
                              <Link href={`/app/management/accounting/withholding-tax/${entry.withholdingTaxDocId}/print`} target="_blank"><Printer className="h-4 w-4"/></Link>
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingEntry(entry)}><Edit className="mr-2 h-4 w-4"/> แก้ไข</DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem onClick={() => setDeletingEntry(entry)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4"/> ลบ
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">ไม่มีรายการในช่วงเวลานี้</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {accounts && (
          <>
            <EntryFormDialog 
                isOpen={isAddDialogOpen} 
                onOpenChange={setIsAddDialogOpen}
                accounts={accounts} 
                allVendors={allVendors} 
                onSaveSuccess={() => {}} 
            />
            {editingEntry && (
                <EntryFormDialog 
                    isOpen={!!editingEntry} 
                    onOpenChange={(open) => !open && setEditingEntry(null)}
                    accounts={accounts} 
                    allVendors={allVendors} 
                    editingEntry={editingEntry}
                    onSaveSuccess={() => {}} 
                />
            )}
          </>
      )}

      <AlertDialog open={!!deletingEntry} onOpenChange={(open) => !open && setDeletingEntry(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการลบรายการ?</AlertDialogTitle>
                  <AlertDialogDescription>
                      ต้องการลบรายการ "{deletingEntry?.description}" หรือไม่?
                      {deletingEntry?.withholdingTaxDocId && (
                          <span className="block mt-2 font-bold text-destructive">
                              * ใบหัก ณ ที่จ่ายที่เกี่ยวข้องจะถูกเปลี่ยนสถานะเป็น "ยกเลิก"
                          </span>
                      )}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isActionLoading}>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isActionLoading}>
                      {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      ยืนยันการลบ
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function CashbookPage() {
    return <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}><CashbookPageContent /></Suspense>;
}
