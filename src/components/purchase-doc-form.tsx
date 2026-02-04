"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where, updateDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown, Camera, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, sanitizeForFirestore } from "@/lib/utils";
import Image from "next/image";

import { createPurchaseDoc } from "@/firebase/purchases";
import type { PurchaseDoc, Vendor, AccountingAccount } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "กรุณากรอกรายการ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().min(0),
  total: z.coerce.number(),
});

const purchaseFormSchema = z.object({
  vendorId: z.string().min(1, "กรุณาเลือกร้านค้า"),
  docDate: z.string().min(1, "กรุณาเลือกวันที่"),
  invoiceNo: z.string().min(1, "กรุณากรอกเลขที่บิล"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().optional(),
  net: z.coerce.number(),
  withTax: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
  paymentMode: z.enum(["CASH", "CREDIT"]),
  dueDate: z.string().optional().nullable(),
  note: z.string().optional(),
  suggestedAccountId: z.string().optional(),
  suggestedPaymentMethod: z.enum(["CASH", "TRANSFER"]).optional(),
});

type PurchaseFormData = z.infer<typeof purchaseFormSchema>;

export function PurchaseDocForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editDocId = searchParams.get("editDocId");
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [vendorSearch, setVendorSearch] = useState("");
  const [isVendorPopoverOpen, setIsVendorPopoverOpen] = useState(false);
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "purchaseDocs", editDocId) : null), [db, editDocId]);
  const { data: docToEdit, isLoading: isLoadingDoc } = useDoc<PurchaseDoc>(docToEditRef);

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      docDate: new Date().toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      withTax: true,
      paymentMode: "CASH",
      subtotal: 0,
      discountAmount: 0,
      net: 0,
      vatAmount: 0,
      grandTotal: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });
  const watchedIsVat = useWatch({ control: form.control, name: "withTax" });
  const watchedPaymentMode = form.watch("paymentMode");

  useEffect(() => {
    if (!db) return;
    const unsubVendors = onSnapshot(query(collection(db, "vendors"), where("isActive", "==", true)), (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
      setIsLoadingData(false);
    });
    const unsubAccounts = onSnapshot(query(collection(db, "accountingAccounts"), where("isActive", "==", true)), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingAccount)));
    });
    return () => { unsubVendors(); unsubAccounts(); };
  }, [db]);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        vendorId: docToEdit.vendorId,
        docDate: docToEdit.docDate,
        invoiceNo: docToEdit.invoiceNo,
        items: docToEdit.items,
        subtotal: docToEdit.subtotal,
        discountAmount: docToEdit.discountAmount,
        net: docToEdit.net,
        withTax: docToEdit.withTax,
        vatAmount: docToEdit.vatAmount,
        grandTotal: docToEdit.grandTotal,
        paymentMode: docToEdit.paymentMode,
        dueDate: docToEdit.dueDate,
        note: docToEdit.note,
      });
    }
  }, [docToEdit, form]);

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal);
    form.setValue("net", net);
    form.setValue("vatAmount", vatAmount);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setPhotos(prev => [...prev, ...files]);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setPhotoPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const onSubmit = async (data: PurchaseFormData) => {
    if (!db || !profile || !storage) return;
    const vendor = vendors.find(v => v.id === data.vendorId);
    if (!vendor) return;

    try {
      const uploadedPhotos: string[] = [];
      for (const file of photos) {
        const photoRef = ref(storage, `purchases/${Date.now()}-${file.name}`);
        await uploadBytes(photoRef, file);
        uploadedPhotos.push(await getDownloadURL(photoRef));
      }

      const docData = {
        ...data,
        vendorSnapshot: { shortName: vendor.shortName, companyName: vendor.companyName, taxId: vendor.taxId },
        billPhotos: uploadedPhotos,
      };

      if (editDocId) {
        await updateDoc(doc(db, "purchaseDocs", editDocId), { ...sanitizeForFirestore(docData), updatedAt: serverTimestamp() });
      } else {
        const docNo = await createPurchaseDoc(db, docData, profile);
        
        // If Cash, create a claim immediately
        if (data.paymentMode === 'CASH') {
            const q = query(collection(db, "purchaseDocs"), where("docNo", "==", docNo));
            const snap = await getDocs(q);
            const newDocId = snap.docs[0].id;
            
            await addDoc(collection(db, "purchaseClaims"), {
                status: 'PENDING',
                createdAt: serverTimestamp(),
                createdByUid: profile.uid,
                createdByName: profile.displayName,
                purchaseDocId: newDocId,
                purchaseDocNo: docNo,
                vendorNameSnapshot: vendor.companyName,
                invoiceNo: data.invoiceNo,
                paymentMode: 'CASH',
                amountTotal: data.grandTotal,
                suggestedAccountId: data.suggestedAccountId,
                suggestedPaymentMethod: data.suggestedPaymentMethod,
                note: data.note,
            });
        } else {
            // If Credit, create a claim for approval to create AP
            const q = query(collection(db, "purchaseDocs"), where("docNo", "==", docNo));
            const snap = await getDocs(q);
            const newDocId = snap.docs[0].id;

            await addDoc(collection(db, "purchaseClaims"), {
                status: 'PENDING',
                createdAt: serverTimestamp(),
                createdByUid: profile.uid,
                createdByName: profile.displayName,
                purchaseDocId: newDocId,
                purchaseDocNo: docNo,
                vendorNameSnapshot: vendor.companyName,
                invoiceNo: data.invoiceNo,
                paymentMode: 'CREDIT',
                amountTotal: data.grandTotal,
                note: data.note,
            });
        }
      }

      toast({ title: "บันทึกรายการซื้อสำเร็จ" });
      router.push("/app/office/parts/purchases");
    } catch (e: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message });
    }
  };

  const filteredVendors = vendors.filter(v => v.companyName.toLowerCase().includes(vendorSearch.toLowerCase()) || v.shortName.toLowerCase().includes(vendorSearch.toLowerCase()));

  if (isLoadingData || isLoadingDoc) return <Skeleton className="h-96" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2"/> กลับ</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}><Save className="mr-2"/> {editDocId ? "บันทึกการแก้ไข" : "ส่งขออนุมัติ"}</Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle className="text-base">1. ข้อมูลผู้ขาย</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField name="vendorId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>ร้านค้า</FormLabel>
                            <Popover open={isVendorPopoverOpen} onOpenChange={setIsVendorPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl><Button variant="outline" className="w-full justify-between">{field.value ? vendors.find(v=>v.id===field.value)?.companyName : "เลือกร้านค้า..."}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50"/></Button></FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Input placeholder="ค้นหา..." value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} className="m-2 w-[calc(100%-1rem)]" />
                                    <ScrollArea className="h-60">
                                        {filteredVendors.map(v => (
                                            <Button key={v.id} variant="ghost" className="w-full justify-start" onClick={()=>{field.onChange(v.id); setIsVendorPopoverOpen(false);}}>{v.shortName} - {v.companyName}</Button>
                                        ))}
                                    </ScrollArea>
                                </PopoverContent>
                            </Popover>
                        </FormItem>
                    )} />
                    <FormField name="invoiceNo" render={({ field }) => (<FormItem><FormLabel>เลขที่บิล</FormLabel><FormControl><Input {...field}/></FormControl></FormItem>)} />
                    <FormField name="docDate" render={({ field }) => (<FormItem><FormLabel>วันที่ในบิล</FormLabel><FormControl><Input type="date" {...field}/></FormControl></FormItem>)} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">2. เงื่อนไขการจ่ายเงิน</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField name="paymentMode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>รูปแบบ</FormLabel>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="CASH" id="p-cash"/>
                              <Label htmlFor="p-cash">เงินสด/โอน</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="CREDIT" id="p-credit"/>
                              <Label htmlFor="p-credit">เครดิต</Label>
                            </div>
                          </RadioGroup>
                        </FormItem>
                    )} />
                    {watchedPaymentMode === 'CREDIT' ? (
                        <FormField name="dueDate" render={({ field }) => (<FormItem><FormLabel>วันครบกำหนด</FormLabel><FormControl><Input type="date" {...field} value={field.value || ''}/></FormControl></FormItem>)} />
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <FormField name="suggestedPaymentMethod" render={({ field }) => (
                              <FormItem>
                                <FormLabel>จ่ายโดย</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="CASH">เงินสด</SelectItem>
                                    <SelectItem value="TRANSFER">เงินโอน</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                            <FormField name="suggestedAccountId" render={({ field }) => (
                              <FormItem>
                                <FormLabel>บัญชีที่จ่าย</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="เลือก..."/></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader><CardTitle className="text-base">3. รายการสินค้า/อะไหล่</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>รายการ</TableHead><TableHead className="w-24">จำนวน</TableHead><TableHead className="w-32">ราคา/หน่วย</TableHead><TableHead className="w-32 text-right">รวม</TableHead><TableHead className="w-12"/></TableRow></TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                            <TableRow key={field.id}>
                                <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} />)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" step="any" {...field} onChange={e => { const v = parseFloat(e.target.value) || 0; field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.unitPrice`)); }} />)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" step="any" {...field} onChange={e => { const v = parseFloat(e.target.value) || 0; field.onChange(v); form.setValue(`items.${index}.total`, v * form.getValues(`items.${index}.quantity`)); }} />)}/></TableCell>
                                <TableCell className="text-right">{(form.watch(`items.${index}.total`) || 0).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={()=>remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={()=>append({description:'', quantity:1, unitPrice:0, total:0})}><PlusCircle className="mr-2"/> เพิ่มรายการ</Button>
            </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle className="text-base">4. แนบรูปบิล</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <Input type="file" multiple accept="image/*" onChange={handlePhotoChange} />
                    <div className="grid grid-cols-4 gap-2">
                        {photoPreviews.map((p, i) => (
                            <div key={i} className="relative aspect-square border rounded-md overflow-hidden">
                                <Image src={p} alt="preview" fill className="object-cover" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-0 right-0 h-6 w-6" onClick={() => {
                                    setPhotos(prev => prev.filter((_, idx) => idx !== i));
                                    setPhotoPreviews(prev => prev.filter((_, idx) => idx !== i));
                                }}><X className="h-3 w-3"/></Button>
                            </div>
                        ))}
                    </div>
                    <FormField name="note" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>)} />
                </CardContent>
            </Card>
            <div className="space-y-2 p-6 border rounded-lg bg-muted/30 h-fit">
                <div className="flex justify-between"><span>รวมเป็นเงิน</span><span>{(form.watch('subtotal') || 0).toLocaleString()}</span></div>
                <div className="flex justify-between items-center">
                    <span>ส่วนลด</span>
                    <FormField name="discountAmount" render={({ field }) => (<Input type="number" className="w-32 text-right" {...field}/>)} />
                </div>
                <div className="flex justify-between items-center py-2">
                    <FormField name="withTax" render={({ field }) => (
                        <div className="flex items-center space-x-2"><Checkbox checked={field.value} onCheckedChange={field.onChange}/><Label>ภาษีมูลค่าเพิ่ม 7%</Label></div>
                    )} />
                    <span>{(form.watch('vatAmount') || 0).toLocaleString()}</span>
                </div>
                <Separator className="my-2"/>
                <div className="flex justify-between text-xl font-bold"><span>ยอดรวมสุทธิ</span><span>{(form.watch('grandTotal') || 0).toLocaleString()}</span></div>
            </div>
        </div>
      </form>
    </Form>
  );
}
