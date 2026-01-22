"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MoreHorizontal, PlusCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Customer } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "Tax information is required when 'Use Tax Invoice' is checked",
  path: ["taxName"], 
});

const CustomerCard = ({ customer, onEdit, onDelete }: { customer: Customer, onEdit: (customer: Customer) => void, onDelete: (customerId: string) => void }) => (
    <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{customer.name}</CardTitle>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(customer)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(customer.id)} className="text-destructive focus:text-destructive">
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <CardDescription>{customer.phone}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm pt-0">
             <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Uses Tax Invoice</span>
                <span className="font-medium">{customer.useTax ? "Yes" : "No"}</span>
            </div>
             {customer.detail && (
                <div className="border-t pt-2">
                    <p className="text-muted-foreground">Details:</p>
                    <p className="whitespace-pre-wrap">{customer.detail}</p>
                </div>
            )}
        </CardContent>
    </Card>
);

function AllCustomersTab() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      detail: "",
      useTax: false,
      taxName: "",
      taxAddress: "",
      taxId: "",
    },
  });
  
  const useTax = form.watch("useTax");

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Failed to load customers" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  useEffect(() => {
    if (isDialogOpen) {
      if (editingCustomer) {
        form.reset(editingCustomer);
      }
    } else {
      setEditingCustomer(null);
      form.reset({
        name: "",
        phone: "",
        detail: "",
        useTax: false,
        taxName: "",
        taxAddress: "",
        taxId: "",
      });
    }
  }, [isDialogOpen, editingCustomer, form]);

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof customerSchema>) => {
    if (!db || !editingCustomer) return;
    setIsSubmitting(true);
    
    try {
        const customerDoc = doc(db, "customers", editingCustomer.id);
        const updateData = { ...values, updatedAt: serverTimestamp() };
        await updateDoc(customerDoc, updateData);
        toast({ title: "Customer updated successfully" });
        setIsDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteRequest = (customerId: string) => {
    setCustomerToDelete(customerId);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !customerToDelete) return;
    
    try {
      const customerDoc = doc(db, "customers", customerToDelete);
      await deleteDoc(customerDoc)
      toast({title: "Customer deleted successfully"});
    } catch (error: any) {
      toast({variant: "destructive", title: "Deletion Failed", description: error.message});
    } finally {
      setIsDeleteAlertOpen(false);
      setCustomerToDelete(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
      <Card className="hidden sm:block">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Uses Tax Invoice</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length > 0 ? (
                customers.map(customer => (
                    <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>{customer.useTax ? "Yes" : "No"}</TableCell>
                    <TableCell>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(customer)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteRequest(customer.id)} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No customers found.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:hidden">
        {customers.length > 0 ? (
          customers.map(customer => (
            <CustomerCard key={customer.id} customer={customer} onEdit={openEditDialog} onDelete={handleDeleteRequest} />
          ))
        ) : (
          <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>No Customers Found</CardTitle>
                <CardDescription>Get started by adding a new customer.</CardDescription>
            </CardHeader>
        </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent 
            className="sm:max-w-[600px]"
            onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Update the details below.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField name="name" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="phone" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="detail" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Details</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="useTax" control={form.control} render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Use Tax Invoice</FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )} />
              {useTax && (
                <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                    <FormField name="taxName" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax Payer Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="taxAddress" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax Address</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="taxId" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax ID</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete the customer. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TaxCustomersTab() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), where("useTax", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      customersData.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(customersData);
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Failed to load tax customers" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);
  
  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
     <Card>
        <CardContent className="pt-6">
           <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tax ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length > 0 ? (
                customers.map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell>{customer.taxId}</TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        ไม่พบข้อมูลลูกค้าที่ใช้ภาษี
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
  )
}

export default function ManagementCustomersPage() {
    return (
        <>
            <PageHeader title="การจัดการลูกค้า" description="จัดการข้อมูลลูกค้าทั้งหมด">
                 <Button asChild>
                    <Link href="/app/office/customers/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Customer
                    </Link>
                </Button>
            </PageHeader>
            <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="all">รายชื่อลูกค้าทั้งหมด</TabsTrigger>
                    <TabsTrigger value="tax">ลูกค้าใช้ภาษี</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    <AllCustomersTab />
                </TabsContent>
                <TabsContent value="tax">
                    <TaxCustomersTab />
                </TabsContent>
            </Tabs>
        </>
    );
}

    