
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, serverTimestamp, updateDoc, writeBatch, where, orderBy, getDocs } from "firebase/firestore";
import Link from "next/link";

import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { createPurchaseDoc } from "@/firebase/purchases";
import { sanitizeForFirestore, cn } from "@/lib/utils";
import type { PurchaseDoc, StoreSettings, Vendor, AccountingAccount } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const lineItemSchema = z.object({
  description: z.string().min(1, "ต้องกรอกรายละเอียด"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const purchaseFormSchema = z.object({
  vendorId: z.string().min(1, "กรุณาเลือกร้านค้า"),
  invoiceNo: z.string().min(1, "กรุณากรอกเลขที่บิล"),
  docDate: z.string().min(1, "กรุณาเลือกวันที่"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  withTax: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  paymentMode: z.enum(['CASH', 'CREDIT'], { required_error: 'กรุณาเลือกรูปแบบการชำระเงิน' }),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  suggestedPaymentMethod: z.enum(['CASH', 'TRANSFER']).optional(),
  suggestedAccountId: z.string().optional(),
}).refine(data => data.paymentMode !== 'CREDIT' || (data.dueDate && data.dueDate.length > 0), {
    message: "กรุณาระบุวันครบกำหนดชำระสำหรับเครดิต",
    path: ["dueDate"],
});

type PurchaseFormData = z.infer<typeof purchaseFormSchema>;

const formatCurrency = (value: number | null | undefined) => (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function NewPurchaseFormContent({ editDocId }: { editDocId: string | null }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const isEditing = !!editDocId;

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);

  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "purchaseDocs", editDocId) : null), [db, editDocId]);
  const { data: docToEdit, isLoading: isLoadingDoc } = useDoc<PurchaseDoc>(docToEditRef);

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      docDate: new Date().toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      withTax: true,
      paymentMode: "CASH",
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const paymentMode = form.watch('paymentMode');

  useEffect(() => {
    if (!db) return;
    
    let vendorsLoaded = false;
    let accountsLoaded = false;

    const checkLoadingDone = () => {
      if (vendorsLoaded && accountsLoaded) {
        setIsLoading(false);
      }
    };

    const qVendors = query(collection(db, "vendors"), where("isActive", "==", true));
    const unsubVendors = onSnapshot(qVendors, 
      (snapshot) => {
        const vendorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
        vendorsData.sort((a, b) => (a.shortName || "").localeCompare(b.shortName || ""));
        setVendors(vendorsData);
        vendorsLoaded = true;
        checkLoadingDone();
      }, 
      (error) => {
        if (error.message.includes("requires an index")) {
          toast({
            title: "Index Information",
            description: "Query นี้ต้องสร้าง index (สามารถเลือกสร้างได้ภายหลัง) แต่ตอนนี้เราแก้โดยตัด orderBy แล้ว",
          });
        } else if (error.message.includes("permission-denied")) {
           toast({ variant: "destructive", title: "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านค้า", description: error.message });
        } else {
           toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลร้านค้าได้", description: error.message });
        }
        vendorsLoaded = true;
        checkLoadingDone();
      }
    );
    
    const qAccounts = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
    const unsubAccounts = onSnapshot(qAccounts, 
      (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountingAccount)));
        accountsLoaded = true;
        checkLoadingDone();
      }, 
      (error) => {
        if (error.message.includes("permission-denied")) {
          toast({ variant: "destructive", title: "ไม่มีสิทธิ์เข้าถึงข้อมูลบัญชี", description: error.message });
        } else {
          toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลบัญชีได้", description: error.message });
        }
        accountsLoaded = true;
        checkLoadingDone();
      }
    );

    return () => { unsubVendors(); unsubAccounts(); };
  }, [db, toast]);
  
  useEffect(() => {
    if (docToEdit) form.reset(docToEdit);
  }, [docToEdit, form]);

  const watchedItems = form.watch("items");
  const watchedDiscount = form.watch("discountAmount");
  const watchedIsVat = form.watch("withTax");

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;
    form.setValue("subtotal", subtotal);
    form.setValue("net", net);
    form.setValue("vatAmount", vatAmount);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);
  
  const handleSave = async (status: 'DRAFT' | 'SUBMITTED') => {
    await form.trigger();
    if (!form.formState.isValid) {
        toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'});
        return;
    }
    const values = form.getValues();

    if (!db || !profile) return;
    const vendor = vendors.find(v => v.id === values.vendorId);
    if (!vendor) {
        toast({ variant: 'destructive', title: 'ไม่พบร้านค้า' });
        return;
    }

    try {
        const docNo = await createPurchaseDoc(db, {
            ...values,
            vendorSnapshot: { shortName: vendor.shortName, companyName: vendor.companyName, taxId: vendor.taxId },
            dueDate: values.paymentMode === 'CREDIT' ? values.dueDate : null,
        }, profile);

        if (status === 'SUBMITTED') {
            const batch = writeBatch(db);
            const purchaseDocs = await getDocs(query(collection(db, 'purchaseDocs'), where('docNo', '==', docNo)));
            if (purchaseDocs.empty) throw new Error('Could not find newly created purchase document.');
            const purchaseDoc = purchaseDocs.docs[0];

            batch.update(purchaseDoc.ref, { status: 'SUBMITTED' });
            
            const claimRef = doc(collection(db, 'purchaseClaims'));
            batch.set(claimRef, {
                status: 'PENDING',
                createdAt: serverTimestamp(),
                createdByUid: profile.uid,
                createdByName: profile.displayName,
                purchaseDocId: purchaseDoc.id,
                purchaseDocNo: docNo,
                vendorNameSnapshot: vendor.companyName,
                invoiceNo: values.invoiceNo,
                paymentMode: values.paymentMode,
                amountTotal: values.grandTotal,
                suggestedAccountId: values.suggestedAccountId,
                suggestedPaymentMethod: values.suggestedPaymentMethod,
                note: values.notes,
            });

            await batch.commit();
            toast({ title: 'ส่งรายการเพื่อขออนุมัติสำเร็จ' });
        } else {
            toast({ title: 'บันทึกฉบับร่างสำเร็จ' });
        }
        
        router.push('/app/office/parts/purchases');
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    }
  };

  const filteredVendors = useMemo(() => {
    if (!customerSearch) return vendors;
    return vendors.filter(v => v.shortName.toLowerCase().includes(customerSearch.toLowerCase()) || v.companyName.toLowerCase().includes(customerSearch.toLowerCase()));
  }, [vendors, customerSearch]);

  if (isLoading || isLoadingDoc) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Form {...form}>
      <form className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField name="vendorId" control={form.control} render={({ field }) => (
                <FormItem className="flex flex-col lg:col-span-2"><FormLabel>ร้านค้า</FormLabel>
                <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}><PopoverTrigger asChild><FormControl>
                    <Button variant="outline" role="combobox" className="justify-between">
                        {field.value ? vendors.find(v => v.id === field.value)?.companyName : "เลือกร้านค้า..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command>
                    <CommandInput placeholder="ค้นหาร้านค้า..." value={customerSearch} onValueChange={setCustomerSearch}/>
                    <CommandList><CommandEmpty>ไม่พบร้านค้า</CommandEmpty><CommandGroup>
                        {filteredVendors.map(v => <CommandItem key={v.id} onSelect={() => { field.onChange(v.id); setIsCustomerPopoverOpen(false); }}>{v.companyName}</CommandItem>)}
                    </CommandGroup></CommandList>
                </Command></PopoverContent></Popover><FormMessage />
                </FormItem>
            )} />
            <FormField name="invoiceNo" control={form.control} render={({ field }) => (<FormItem><FormLabel>เลขที่บิล</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField name="docDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่เอกสาร</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
        </div>

        <Card><CardHeader><CardTitle>รายการ</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-24">จำนวน</TableHead><TableHead className="w-32">ราคา/หน่วย</TableHead><TableHead className="w-32">รวม</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>
                {fields.map((field, index) => (
                    <TableRow key={field.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} />)}/></TableCell>
                        <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} className="text-right" />)}/></TableCell>
                        <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" {...field} className="text-right" />)}/></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell>
                        <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell>
                    </TableRow>
                ))}
            </TableBody></Table>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ description: '', quantity: 1, unitPrice: 0, total: 0 })}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
        </CardContent></Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <Card><CardHeader><CardTitle>ข้อมูลการชำระเงินและอื่นๆ</CardTitle></CardHeader><CardContent className="space-y-4">
                <FormField control={form.control} name="paymentMode" render={({ field }) => (<FormItem><FormLabel>รูปแบบการชำระเงิน</FormLabel><FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="CASH" /></FormControl><FormLabel className="font-normal">เงินสด</FormLabel></FormItem>
                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="CREDIT" /></FormControl><FormLabel className="font-normal">เครดิต</FormLabel></FormItem>
                    </RadioGroup>
                </FormControl><FormMessage /></FormItem>)} />
                {paymentMode === 'CREDIT' && <FormField name="dueDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันครบกำหนดชำระ</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />}
                {paymentMode === 'CASH' && (
                    <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                        <h4 className="font-semibold text-sm">ข้อมูลสำหรับฝ่ายบัญชี</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField control={form.control} name="suggestedPaymentMethod" render={({ field }) => (<FormItem><FormLabel>ช่องทางที่คาดว่าจะจ่าย</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="suggestedAccountId" render={({ field }) => (<FormItem><FormLabel>บัญชีที่จะจ่าย</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..." /></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                        </div>
                    </div>
                )}
                <FormField name="notes" control={form.control} render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
            </CardContent></Card>
            <Card><CardHeader><CardTitle>สรุปยอด</CardTitle></CardHeader><CardContent className="space-y-2">
                <div className="flex justify-between"><span>รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div>
                <div className="flex justify-between items-center"><span>ส่วนลด</span><FormField control={form.control} name="discountAmount" render={({ field }) => (<Input type="number" {...field} className="w-32 text-right"/>)}/></div>
                <div className="flex justify-between font-medium"><span>ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                <div className="flex justify-between items-center">
                    <FormField control={form.control} name="withTax" render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel></FormItem>
                    )}/>
                    <span>{formatCurrency(form.watch('vatAmount'))}</span>
                </div>
                <Separator/>
                <div className="flex justify-between text-lg font-bold"><span>ยอดสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div>
            </CardContent></Card>
        </div>

        <div className="flex justify-between items-center pt-4">
            <Button type="button" variant="outline" asChild><Link href="/app/office/parts/purchases"><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Link></Button>
            <div className="flex gap-4">
                <Button type="button" variant="secondary" onClick={() => handleSave('DRAFT')} disabled={form.formState.isSubmitting}><Save className="mr-2 h-4 w-4"/> บันทึกฉบับร่าง</Button>
                <Button type="button" onClick={() => handleSave('SUBMITTED')} disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>} ส่งให้บัญชีตรวจสอบ</Button>
            </div>
        </div>
      </form>
    </Form>
  );
}

export default function NewPurchasePage() {
    const searchParams = useSearchParams();
    const editDocId = searchParams.get('editDocId');
    const title = editDocId ? "แก้ไขรายการซื้อ" : "สร้างรายการซื้อใหม่";
    const description = editDocId ? "แก้ไขรายละเอียดของเอกสารจัดซื้อ" : "กรอกข้อมูลบิลเพื่อสร้างเอกสารจัดซื้อ";
  
    return (
      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
        <PageHeader title={title} description={description} />
        <NewPurchaseFormContent editDocId={editDocId} />
      </Suspense>
    );
}
