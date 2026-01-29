
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, onSnapshot, query, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowLeft, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createDocument } from "@/firebase/documents";
import type { StoreSettings, Customer, Document as DocumentType, UserProfile } from "@/lib/types";
import { useDoc } from "@/firebase/firestore/use-doc";
import { safeFormat } from "@/lib/date-utils";

const billingNoteSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  invoiceIds: z.array(z.string()).min(1, "At least one invoice must be selected."),
  totalAmount: z.coerce.number().min(0.01),
  notes: z.string().optional(),
  senderName: z.string().optional(),
  receiverName: z.string().optional(),
});

type BillingNoteFormData = z.infer<typeof billingNoteSchema>;

export function BillingNoteForm() {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<DocumentType[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, DocumentType>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);

  const storeSettingsRef = useMemo(() => (db ? doc(db, "settings", "store") : null), [db]);
  const { data: storeSettings, isLoading: isLoadingStore } = useDoc<StoreSettings>(storeSettingsRef);

  const form = useForm<BillingNoteFormData>({
    resolver: zodResolver(billingNoteSchema),
    defaultValues: {
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split("T")[0],
      invoiceIds: [],
      totalAmount: 0,
    },
  });

  const selectedCustomerId = form.watch('customerId');

  // Fetch all customers
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setIsLoading(false);
    }, (error) => {
      toast({ variant: "destructive", title: "Failed to load customers" });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);
  
  // Fetch invoices for the selected customer
  useEffect(() => {
    if (!db || !selectedCustomerId) {
        setInvoices([]);
        return;
    }
    // Note: In a real app, you'd likely filter by payment status e.g., where("paymentStatus", "!=", "PAID")
    // Query by customer ID first, then filter by docType on the client to avoid needing a composite index.
    const q = query(
        collection(db, "documents"),
        where("customerSnapshot.id", "==", selectedCustomerId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allCustomerDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentType));
      const taxInvoices = allCustomerDocs.filter(doc => doc.docType === 'TAX_INVOICE');
      setInvoices(taxInvoices);
    });
    return () => unsubscribe();
  }, [db, selectedCustomerId]);
  
  // Update form values when selected invoices change
  useEffect(() => {
    const ids = Object.keys(selectedInvoices);
    const total = Object.values(selectedInvoices).reduce((sum, inv) => sum + inv.grandTotal, 0);
    form.setValue('invoiceIds', ids);
    form.setValue('totalAmount', total);
  }, [selectedInvoices, form]);

  // Set sender/receiver names
  useEffect(() => {
    if (profile) form.setValue('senderName', profile.displayName);
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (customer) form.setValue('receiverName', customer.name);
  }, [profile, selectedCustomerId, customers, form]);

  const handleInvoiceSelect = (invoice: DocumentType) => {
    setSelectedInvoices(prev => {
        const newSelection = { ...prev };
        if (newSelection[invoice.id]) {
            delete newSelection[invoice.id];
        } else {
            newSelection[invoice.id] = invoice;
        }
        return newSelection;
    });
  };

  const onSubmit = async (data: BillingNoteFormData) => {
    if (!db || !storeSettings || !profile || !selectedCustomerId) return;
    
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) {
        toast({ variant: "destructive", title: "Customer not found."});
        return;
    }

    const itemsForDoc = Object.values(selectedInvoices).map(inv => ({
        description: `ใบกำกับภาษีเลขที่ ${inv.docNo} (วันที่: ${safeFormat(new Date(inv.docDate), 'dd/MM/yy')})`,
        quantity: 1,
        unitPrice: inv.grandTotal,
        total: inv.grandTotal,
    }));

    try {
        const documentData = {
            docDate: data.issueDate,
            customerSnapshot: { ...customer },
            storeSnapshot: { ...storeSettings },
            items: itemsForDoc,
            invoiceIds: data.invoiceIds,
            subtotal: data.totalAmount, // For BillingNote, subtotal, net, and grandTotal are the same
            discountAmount: 0,
            net: data.totalAmount,
            withTax: false,
            vatAmount: 0,
            grandTotal: data.totalAmount,
            notes: data.notes,
            dueDate: data.dueDate,
            senderName: data.senderName,
            receiverName: data.receiverName,
        };

        await createDocument(db, 'BILLING_NOTE', documentData, profile);
        toast({ title: "Billing Note Created" });
        router.push('/app/management/accounting/documents/billing-note');
    } catch(error: any) {
         toast({ variant: "destructive", title: "Failed to create Billing Note", description: error.message });
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  }, [customers, customerSearch]);

  if (isLoading || isLoadingStore) return <div className="flex justify-center items-center h-64"><Loader2 className="mx-auto animate-spin" /></div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-end items-center">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
              Save Billing Note
            </Button>
        </div>
        
        <Card>
            <CardHeader><CardTitle className="text-base">1. Select Customer</CardTitle></CardHeader>
            <CardContent>
                <FormField
                    name="customerId"
                    render={({ field }) => (
                        <FormItem>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                {field.value ? customers.find(c => c.id === field.value)?.name : "Select a customer..."}
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
            </CardContent>
        </Card>

        {selectedCustomerId && (
            <Card>
                <CardHeader><CardTitle className="text-base">2. Select Invoices to Bill</CardTitle></CardHeader>
                <CardContent>
                    {invoices.length > 0 ? (
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader><TableRow><TableHead className="w-12" /><TableHead>Invoice No.</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {invoices.map(inv => (
                                        <TableRow key={inv.id}>
                                            <TableCell><Checkbox checked={!!selectedInvoices[inv.id]} onCheckedChange={() => handleInvoiceSelect(inv)} /></TableCell>
                                            <TableCell>{inv.docNo}</TableCell>
                                            <TableCell>{safeFormat(new Date(inv.docDate), "dd/MM/yyyy")}</TableCell>
                                            <TableCell className="text-right">{inv.grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center p-4">No outstanding tax invoices found for this customer.</p>
                    )}
                </CardContent>
            </Card>
        )}
        
        {form.getValues('invoiceIds').length > 0 && (
            <Card>
                <CardHeader><CardTitle className="text-base">3. Billing Note Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>Billing Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>Payment Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="senderName" render={({ field }) => (<FormItem><FormLabel>ผู้วางบิล</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="receiverName" render={({ field }) => (<FormItem><FormLabel>ผู้รับวางบิล</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    </div>
                </CardContent>
                <CardFooter className="flex-col items-end gap-2">
                    <div className="flex justify-between w-full max-w-xs">
                        <span className="text-muted-foreground">Total Amount:</span>
                        <span className="font-bold text-lg">฿{form.watch('totalAmount').toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                    </div>
                </CardFooter>
            </Card>
        )}
      </form>
    </Form>
  )
}
