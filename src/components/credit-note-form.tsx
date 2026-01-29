
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";

import { createDocument } from "@/firebase/documents";
import type { StoreSettings, Customer, Document as DocumentType } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const creditNoteFormSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  taxInvoiceId: z.string().min(1, "กรุณาเลือกใบกำกับภาษี"),
  docDate: z.string().min(1, "กรุณาเลือกวันที่"),
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  subtotal: z.coerce.number(),
  discountAmount: z.coerce.number().min(0).optional(),
  net: z.coerce.number(),
  withTax: z.boolean().default(true),
  vatAmount: z.coerce.number(),
  grandTotal: z.coerce.number(),
});

type CreditNoteFormData = z.infer<typeof creditNoteFormSchema>;

const formatCurrency = (value: number | null | undefined) => {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function CreditNoteForm() {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<DocumentType[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [createdDocId, setCreatedDocId] = useState<string | null>(null);

  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);

  const form = useForm<CreditNoteFormData>({
    resolver: zodResolver(creditNoteFormSchema),
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

  const selectedCustomerId = form.watch('customerId');
  const selectedInvoiceId = form.watch('taxInvoiceId');

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!db || !selectedCustomerId) {
      setInvoices([]);
      return;
    }
    const q = query(collection(db, "documents"), where("customerId", "==", selectedCustomerId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customerDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentType));
      const taxInvoices = customerDocs.filter(doc => doc.docType === 'TAX_INVOICE' && doc.status !== 'CANCELLED');
      setInvoices(taxInvoices);
    });
    return () => unsubscribe();
  }, [db, selectedCustomerId]);
  
  useEffect(() => {
    const selectedInvoice = invoices.find(inv => inv.id === selectedInvoiceId);
    if(selectedInvoice) {
      form.setValue('items', selectedInvoice.items);
      form.setValue('withTax', selectedInvoice.withTax);
      form.setValue('discountAmount', selectedInvoice.discountAmount);
    }
  }, [selectedInvoiceId, invoices, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discountAmount" });
  const watchedIsVat = useWatch({ control: form.control, name: "withTax" });

  useEffect(() => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount = watchedDiscount || 0;
    const net = subtotal - discount;
    const vatAmount = watchedIsVat ? net * 0.07 : 0;
    const grandTotal = net + vatAmount;

    form.setValue("subtotal", subtotal, { shouldValidate: true });
    form.setValue("net", net, { shouldValidate: true });
    form.setValue("vatAmount", vatAmount, { shouldValidate: true });
    form.setValue("grandTotal", grandTotal, { shouldValidate: true });
  }, [watchedItems, watchedDiscount, watchedIsVat, form]);

  const onSubmit = async (data: CreditNoteFormData) => {
    const customer = customers.find(c => c.id === data.customerId);
    if (!db || !customer || !storeSettings || !profile) return;
    
    const documentData = {
      docDate: data.docDate,
      customerId: data.customerId,
      customerSnapshot: { ...customer },
      storeSnapshot: { ...storeSettings },
      items: data.items,
      subtotal: data.subtotal,
      discountAmount: data.discountAmount || 0,
      net: data.net,
      withTax: data.withTax,
      vatAmount: data.vatAmount,
      grandTotal: data.grandTotal,
      reason: data.reason,
      notes: data.notes,
      referencesDocIds: [data.taxInvoiceId],
    };

    try {
      const { docId, docNo } = await createDocument(db, 'CREDIT_NOTE', documentData, profile);
      toast({ title: "สร้างใบลดหนี้สำเร็จ", description: `เลขที่: ${docNo}` });
      setCreatedDocId(docId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  }, [customers, customerSearch]);
  
  const isLoading = isLoadingCustomers || isLoadingStore;

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-end gap-4">
          {createdDocId ? (
            <>
              <Button type="button" variant="outline" onClick={() => router.push(`/app/office/documents/${createdDocId}`)}>พรีวิว</Button>
              <Button type="button" onClick={() => window.open(`/app/office/documents/${createdDocId}?print=1&autoprint=1`, '_blank')}>พิมพ์ PDF</Button>
            </>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
              บันทึกใบลดหนี้
            </Button>
          )}
        </div>
        <Card>
          <CardHeader><CardTitle>1. เลือกลูกค้าและใบกำกับภาษี</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ลูกค้า</FormLabel>
                  <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" role="combobox" className="w-[300px] justify-between">
                          {field.value ? customers.find(c => c.id === field.value)?.name : "เลือกลูกค้า..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Input placeholder="ค้นหา..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="m-2 w-[calc(100%-1rem)]" />
                      <ScrollArea className="h-60">
                        {filteredCustomers.map(c => (
                          <Button variant="ghost" key={c.id} onClick={() => { field.onChange(c.id); setIsCustomerPopoverOpen(false); }} className="w-full justify-start">{c.name}</Button>
                        ))}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedCustomerId && (
              <FormField
                name="taxInvoiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>อ้างอิงใบกำกับภาษี</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-[300px]"><SelectValue placeholder="เลือกใบกำกับภาษี..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {invoices.map(inv => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.docNo} - {safeFormat(new Date(inv.docDate), "dd/MM/yy")} - {formatCurrency(inv.grandTotal)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {selectedInvoiceId && (
          <>
            <Card>
              <CardHeader><CardTitle>2. รายละเอียดใบลดหนี้</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="docDate" render={({ field }) => (<FormItem className="w-[300px]"><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>เหตุผลการลดหนี้</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead className="w-32 text-right">จำนวน</TableHead>
                      <TableHead className="w-40 text-right">ราคา/หน่วย</TableHead>
                      <TableHead className="w-40 text-right">ยอดรวม</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} />)}/></TableCell>
                        <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" className="text-right" {...field} />)}/></TableCell>
                        <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" className="text-right" {...field} />)}/></TableCell>
                        <TableCell className="text-right">{formatCurrency(form.watch(`items.${index}.total`))}</TableCell>
                        <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unitPrice: 0, total: 0 })}><PlusCircle className="mr-2"/>เพิ่มรายการ</Button>
              </CardContent>
              <CardFooter className="flex flex-col items-end gap-2">
                <div className="flex justify-between w-full max-w-sm"><span>รวมเป็นเงิน</span><span>{formatCurrency(form.watch('subtotal'))}</span></div>
                <div className="flex justify-between w-full max-w-sm"><span>ส่วนลด</span><span>{formatCurrency(form.watch('discountAmount'))}</span></div>
                <div className="flex justify-between w-full max-w-sm font-medium"><span>ยอดหลังหักส่วนลด</span><span>{formatCurrency(form.watch('net'))}</span></div>
                <div className="flex justify-between w-full max-w-sm">
                  <FormField control={form.control} name="withTax" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                      <FormLabel>ภาษีมูลค่าเพิ่ม 7%</FormLabel>
                    </FormItem>
                  )}/>
                  <span>{formatCurrency(form.watch('vatAmount'))}</span>
                </div>
                <Separator className="max-w-sm"/>
                <div className="flex justify-between w-full max-w-sm text-lg font-bold"><span>ยอดรวมสุทธิ</span><span>{formatCurrency(form.watch('grandTotal'))}</span></div>
              </CardFooter>
            </Card>
          </>
        )}
      </form>
    </Form>
  );
}

    