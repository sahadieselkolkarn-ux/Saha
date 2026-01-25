"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, writeBatch, serverTimestamp, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createPurchaseDoc } from "@/firebase/purchases";
import { sanitizeForFirestore, cn } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, Send, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { Vendor, PurchaseDoc } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "ต้องกรอกรายละเอียด"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0, "ราคาต่อหน่วยห้ามติดลบ"),
  total: z.coerce.number(),
});

const purchaseFormSchema = z.object({
  vendorId: z.string().min(1, "กรุณาเลือกร้านค้า"),
  invoiceNo: z.string().min(1, "กรุณากรอกเลขที่บิล"),
  docDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  withTax: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  paymentMode: z.enum(['CASH', 'CREDIT'], { required_error: "กรุณาเลือกวิธีการชำระเงิน" }),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.paymentMode !== 'CREDIT' || (data.dueDate && data.dueDate.length > 0), {
    message: "กรุณาระบุวันครบกำหนดชำระ",
    path: ["dueDate"],
});

type PurchaseFormData = z.infer<typeof purchaseFormSchema>;

export default function NewPurchasePage() {
    const router = useRouter();
    const { db } = useFirebase();
    const { profile } = useAuth();
    const { toast } = useToast();

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [vendorSearch, setVendorSearch] = useState("");
    const [isVendorPopoverOpen, setIsVendorPopoverOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<PurchaseFormData>({
        resolver: zodResolver(purchaseFormSchema),
        defaultValues: {
            docDate: new Date().toISOString().split("T")[0],
            items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
            withTax: true,
            subtotal: 0,
            discountAmount: 0,
            net: 0,
            vatAmount: 0,
            grandTotal: 0,
        },
    });

    const paymentMode = form.watch("paymentMode");
    
    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const q = query(collection(db, "vendors"), where("isActive", "==", true), orderBy("shortName", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor)));
            setIsLoading(false);
        }, (error) => {
            toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลร้านค้าได้" });
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [db, toast]);

    const filteredVendors = useMemo(() => {
        if (!vendorSearch) return vendors;
        return vendors.filter(v => 
            v.shortName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
            v.companyName.toLowerCase().includes(vendorSearch.toLowerCase())
        );
    }, [vendors, vendorSearch]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const watchedItems = form.watch("items");
    const watchedDiscount = form.watch("discountAmount");
    const watchedIsVat = form.watch("withTax");

    useEffect(() => {
        let subtotal = 0;
        watchedItems.forEach((item, index) => {
            const quantity = item.quantity || 0;
            const unitPrice = item.unitPrice || 0;
            const total = quantity * unitPrice;
            form.setValue(`items.${index}.total`, total);
            subtotal += total;
        });
        const discount = watchedDiscount || 0;
        const net = subtotal - discount;
        const vatAmount = watchedIsVat ? net * 0.07 : 0;
        const grandTotal = net + vatAmount;
        form.setValue("subtotal", subtotal);
        form.setValue("net", net);
        form.setValue("vatAmount", vatAmount);
        form.setValue("grandTotal", grandTotal);
    }, [watchedItems, watchedDiscount, watchedIsVat, form]);
    
    const handleFormSubmit = async (data: PurchaseFormData, status: 'DRAFT' | 'SUBMITTED') => {
        if (!db || !profile) return;
        const selectedVendor = vendors.find(v => v.id === data.vendorId);
        if (!selectedVendor) {
            toast({ variant: "destructive", title: "ไม่พบร้านค้าที่เลือก" });
            return;
        }

        setIsSubmitting(true);
        try {
            const purchaseDocRef = doc(collection(db, 'purchaseDocs'));
            // Create a dummy object for doc number generation, as it doesn't need all fields.
            const dummyDataForDocNo = { docDate: data.docDate };
            const docNo = await createPurchaseDoc(db, dummyDataForDocNo as any, profile);

            const batch = writeBatch(db);
            
            const newDocData: Omit<PurchaseDoc, 'createdAt' | 'updatedAt'| 'id'> = {
                ...data,
                docNo,
                status,
                vendorSnapshot: { shortName: selectedVendor.shortName, companyName: selectedVendor.companyName, taxId: selectedVendor.taxId },
                dueDate: data.paymentMode === 'CREDIT' ? data.dueDate : null,
            };

            batch.set(purchaseDocRef, sanitizeForFirestore({ ...newDocData, id: purchaseDocRef.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));

            if (status === 'SUBMITTED') {
                const claimRef = doc(collection(db, 'purchaseClaims'));
                batch.set(claimRef, {
                    id: claimRef.id,
                    status: 'PENDING',
                    createdAt: serverTimestamp(),
                    createdByUid: profile.uid,
                    createdByName: profile.displayName,
                    purchaseDocId: purchaseDocRef.id,
                    purchaseDocNo: docNo,
                    vendorNameSnapshot: selectedVendor.companyName,
                    invoiceNo: data.invoiceNo,
                    paymentMode: data.paymentMode,
                    amountTotal: data.grandTotal,
                });
            }

            await batch.commit();
            toast({ title: "บันทึกสำเร็จ", description: `เอกสารจัดซื้อเลขที่ ${docNo} ถูกสร้างแล้ว` });
            router.push('/app/office/parts/purchases');

        } catch (e: any) {
            console.error("Submission error:", e);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <PageHeader title="สร้างรายการซื้อ" description="บันทึกบิลซื้อสินค้า/อะไหล่จากร้านค้า" />
            <Form {...form}>
                <form onSubmit={e => e.preventDefault()} className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>ข้อมูลบิล</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                name="vendorId"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>ร้านค้า</FormLabel>
                                    <Popover open={isVendorPopoverOpen} onOpenChange={setIsVendorPopoverOpen}>
                                        <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant="outline" role="combobox" className={cn("w-full max-w-sm justify-between", !field.value && "text-muted-foreground")}>
                                            {field.value ? vendors.find(v => v.id === field.value)?.shortName : "เลือกร้านค้า..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                            <div className="p-2 border-b"><Input autoFocus placeholder="ค้นหา..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} /></div>
                                            <ScrollArea className="h-fit max-h-60">
                                                {isLoading ? <Loader2 className="mx-auto my-4 animate-spin"/> : filteredVendors.map((v) => (
                                                <Button variant="ghost" key={v.id} onClick={() => { field.onChange(v.id); setIsVendorPopoverOpen(false); }} className="w-full justify-start h-auto py-2 px-3">
                                                    <div><p>{v.shortName}</p><p className="text-xs text-muted-foreground">{v.companyName}</p></div>
                                                </Button>
                                                ))}
                                            </ScrollArea>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField name="invoiceNo" control={form.control} render={({ field }) => (<FormItem><FormLabel>เลขที่บิล</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField name="docDate" control={form.control} render={({ field }) => (<FormItem><FormLabel>วันที่บนบิล</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>รายการ</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>รายละเอียด</TableHead>
                                        <TableHead className="w-32 text-right">จำนวน</TableHead>
                                        <TableHead className="w-40 text-right">ราคา/หน่วย</TableHead>
                                        <TableHead className="w-40 text-right">ยอดรวม</TableHead>
                                        <TableHead className="w-12"/>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field, index) => (
                                        <TableRow key={field.id}>
                                            <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} />)}/></TableCell>
                                            <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                            <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                            <TableCell className="text-right font-medium">{form.watch(`items.${index}.total`).toLocaleString('th-TH', {minimumFractionDigits: 2})}</TableCell>
                                            <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="text-destructive h-4 w-4"/></Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
                        </CardContent>
                        <CardFooter className="flex flex-col items-end gap-2">
                             <div className="flex justify-between w-full max-w-xs"><span className="text-muted-foreground">รวมเป็นเงิน</span><span>{form.watch('subtotal').toLocaleString('th-TH', {minimumFractionDigits: 2})}</span></div>
                            <div className="flex justify-between w-full max-w-xs items-center"><span className="text-muted-foreground">ส่วนลด</span><FormField control={form.control} name="discountAmount" render={({ field }) => (<Input type="number" {...field} className="w-32 text-right"/>)}/></div>
                            <div className="flex justify-between w-full max-w-xs font-medium"><span className="text-muted-foreground">ยอดหลังหักส่วนลด</span><span>{form.watch('net').toLocaleString('th-TH', {minimumFractionDigits: 2})}</span></div>
                            <div className="flex justify-between w-full max-w-xs items-center">
                                <FormField control={form.control} name="withTax" render={({ field }) => (<FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormLabel className="font-normal">ภาษีมูลค่าเพิ่ม 7%</FormLabel></FormItem>)}/>
                                <span>{form.watch('vatAmount').toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between w-full max-w-xs text-lg font-bold"><span>ยอดสุทธิ</span><span>{form.watch('grandTotal').toLocaleString('th-TH', {minimumFractionDigits: 2})}</span></div>
                        </CardFooter>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>การชำระเงินและหมายเหตุ</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField control={form.control} name="paymentMode" render={({ field }) => (
                                <FormItem><FormLabel>วิธีชำระเงิน</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="CASH" /></FormControl><FormLabel className="font-normal">เงินสด</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="CREDIT" /></FormControl><FormLabel className="font-normal">เครดิต</FormLabel></FormItem>
                                </RadioGroup></FormControl><FormMessage /></FormItem>
                            )} />
                            {paymentMode === 'CREDIT' && (
                                <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>วันครบกำหนดชำระ</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            )}
                            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" onClick={form.handleSubmit(data => handleFormSubmit(data, 'DRAFT'))} disabled={isSubmitting} variant="outline">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            บันทึกฉบับร่าง
                        </Button>
                        <Button type="button" onClick={form.handleSubmit(data => handleFormSubmit(data, 'SUBMITTED'))} disabled={isSubmitting}>
                             {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                            ส่งให้บัญชีตรวจสอบ
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    );
}
