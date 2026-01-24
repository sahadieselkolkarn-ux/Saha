
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { createDocument } from "@/firebase/documents";
import { sanitizeForFirestore } from "@/lib/utils";
import type { Job, StoreSettings, Customer, Document as DocumentType } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  total: z.coerce.number(),
});

const deliveryNoteFormSchema = z.object({
  jobId: z.string().optional(),
  customerId: z.string().min(1, "Customer is required"),
  issueDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "At least one item is required."),
  subtotal: z.coerce.number(),
  grandTotal: z.coerce.number(),
  notes: z.string().optional(),
  senderName: z.string().optional(),
  receiverName: z.string().optional(),
});

type DeliveryNoteFormData = z.infer<typeof deliveryNoteFormSchema>;

export default function DeliveryNoteForm({ jobId, editDocId }: { jobId: string | null, editDocId: string | null }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const isEditing = !!editDocId;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  
  const jobDocRef = useMemo(() => (db && jobId ? doc(db, "jobs", jobId) : null), [db, jobId]);
  const docToEditRef = useMemo(() => (db && editDocId ? doc(db, "documents", editDocId) : null), [db, editDocId]);
  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);

  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobDocRef);
  const { data: docToEdit, isLoading: isLoadingDocToEdit } = useDoc<DocumentType>(docToEditRef);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);
  
  const form = useForm<DeliveryNoteFormData>({
    resolver: zodResolver(deliveryNoteFormSchema),
    defaultValues: {
      jobId: jobId || undefined,
      issueDate: new Date().toISOString().split("T")[0],
      items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      subtotal: 0,
      grandTotal: 0,
    },
  });

  const selectedCustomerId = form.watch('customerId');
  
  const customerDocRef = useMemo(() => {
    if (!db || !selectedCustomerId) return null;
    return doc(db, 'customers', selectedCustomerId);
  }, [db, selectedCustomerId]);

  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerDocRef);

  useEffect(() => {
    if (docToEdit) {
      form.reset({
        jobId: docToEdit.jobId || undefined,
        customerId: docToEdit.customerSnapshot.id,
        issueDate: docToEdit.docDate,
        items: docToEdit.items.map(item => ({...item})),
        notes: docToEdit.notes,
        senderName: profile?.displayName || docToEdit.senderName,
        receiverName: docToEdit.customerSnapshot.name || docToEdit.receiverName,
      })
    } else if (job) {
        form.setValue('customerId', job.customerId);
        form.setValue('items', [{ description: job.description, quantity: 1, unitPrice: 0, total: 0 }]);
        form.setValue('receiverName', job.customerSnapshot.name);
    }
    if (profile) {
        form.setValue('senderName', profile.displayName);
    }
  }, [job, docToEdit, profile, form]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoadingCustomers(false);
    }, (error) => {
      toast({ variant: "destructive", title: "Failed to load customers" });
      setIsLoadingCustomers(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = form.watch("items");

  useEffect(() => {
    let subtotal = 0;
    watchedItems.forEach((item, index) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const total = quantity * unitPrice;
      form.setValue(`items.${index}.total`, total);
      subtotal += total;
    });

    const grandTotal = subtotal;

    form.setValue("subtotal", subtotal);
    form.setValue("grandTotal", grandTotal);
  }, [watchedItems, form]);

  const onSubmit = async (data: DeliveryNoteFormData) => {
    const customerSnapshot = customer ?? docToEdit?.customerSnapshot ?? job?.customerSnapshot;
    if (!db || !customerSnapshot || !storeSettings || !profile) {
        toast({ variant: "destructive", title: "Missing data for document creation." });
        return;
    }

    const documentData = {
        docDate: data.issueDate,
        jobId: data.jobId,
        customerSnapshot: { ...customerSnapshot },
        carSnapshot: job ? { licensePlate: job.carServiceDetails?.licensePlate, details: job.description } : (docToEdit?.carSnapshot || {}),
        storeSnapshot: { ...storeSettings },
        items: data.items,
        subtotal: data.subtotal,
        discountAmount: 0,
        net: data.grandTotal,
        withTax: false,
        vatAmount: 0,
        grandTotal: data.grandTotal,
        notes: data.notes,
        senderName: data.senderName,
        receiverName: data.receiverName,
    };

    try {
        if (isEditing && editDocId) {
            const docRef = doc(db, 'documents', editDocId);
            await updateDoc(docRef, sanitizeForFirestore({
                ...documentData,
                updatedAt: serverTimestamp(),
            }));
            toast({ title: "Delivery Note Updated" });
        } else {
            await createDocument(
                db,
                'DELIVERY_NOTE',
                documentData,
                profile,
                data.jobId ? 'WAITING_CUSTOMER_PICKUP' : undefined
            );
            toast({ title: "Delivery Note Created" });
        }
        router.push('/app/office/documents/delivery-note');

    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to create document", description: error.message });
    }
  };

  const isLoading = isLoadingJob || isLoadingStore || isLoadingCustomers || isLoadingCustomer || isLoadingDocToEdit;
  const isFormLoading = form.formState.isSubmitting || isLoading;
  const displayCustomer = customer || docToEdit?.customerSnapshot || job?.customerSnapshot;

  if (isLoading && !job && !docToEdit) {
    return <Skeleton className="h-96" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
            <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft/> Back</Button>
            <Button type="submit" disabled={isFormLoading}>
              {isFormLoading ? <Loader2 className="animate-spin" /> : <Save />}
              {isEditing ? 'Save Changes' : 'Save Delivery Note'}
            </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border rounded-lg bg-card">
            <div className="lg:col-span-2 space-y-2">
                <h2 className="text-xl font-bold">{storeSettings?.informalName || storeSettings?.taxName || 'Your Company'}</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{storeSettings?.taxAddress}</p>
                <p className="text-sm text-muted-foreground">โทร: {storeSettings?.phone}</p>
            </div>
            <div className="space-y-4">
                 <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>วันที่</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
            </div>
        </div>

        <Card>
            <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
            <CardContent>
                <FormField
                    name="customerId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Customer</FormLabel>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className={cn("w-full max-w-sm justify-between", !field.value && "text-muted-foreground")} disabled={!!jobId || !!editDocId}>
                                {displayCustomer ? `${displayCustomer.name} (${displayCustomer.phone})` : "Select a customer..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <div className="p-2 border-b">
                                    <Input placeholder="Search..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                                </div>
                                <ScrollArea className="h-60">
                                    {filteredCustomers.map(c => (
                                        <Button variant="ghost" key={c.id} onClick={() => {field.onChange(c.id); setIsCustomerPopoverOpen(false);}} className="w-full justify-start">{c.name}</Button>
                                    ))}
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                        </FormItem>
                    )}
                />
                 {displayCustomer && (
                    <>
                        <p className="text-sm text-muted-foreground mt-2">{displayCustomer.taxAddress || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">โทร: {displayCustomer.phone}</p>
                    </>
                 )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>รายการ</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="w-40 text-right">ยอดรวม</TableHead><TableHead className="w-12"/></TableRow></TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                            <TableRow key={field.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} placeholder="Product or service details" />)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" {...field} className="text-right"/>)}/></TableCell>
                                <TableCell className="text-right font-medium">{form.watch(`items.${index}.total`).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({description: '', quantity: 1, unitPrice: 0, total: 0})}><PlusCircle/> Add Item</Button>
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Card>
                <CardHeader><CardTitle>หมายเหตุ</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="notes" render={({ field }) => (<Textarea {...field} placeholder="เงื่อนไข หรืออื่นๆ" rows={3} />)} />
                </CardContent>
            </Card>
             <div className="space-y-4">
                 <div className="space-y-2 p-4 border rounded-lg h-full flex items-end justify-end">
                    <div className="flex justify-between items-center text-lg font-bold border-t border-b py-2 px-4 w-64">
                        <span>รวมเงิน</span>
                        <span>{form.watch('grandTotal').toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                 </div>
            </div>
        </div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งของ</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับของ</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
        </div>
      </form>
    </Form>
  )
}
