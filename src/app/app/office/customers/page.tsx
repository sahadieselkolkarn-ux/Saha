"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MoreHorizontal, PlusCircle } from "lucide-react";
import type { Customer } from "@/lib/types";
import { errorEmitter, FirestorePermissionError } from "@/firebase";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  detail: z.string().optional(),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "Tax information is required when 'Use Tax Invoice' is checked",
  path: ["taxName"],
});

export default function CustomersPage() {
  const { db } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { useTax: false },
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
      const permissionError = new FirestorePermissionError({
          path: collection(db, "customers").path,
          operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db]);

  const openDialog = (customer: Customer | null = null) => {
    setEditingCustomer(customer);
    form.reset(customer || { name: "", phone: "", detail: "", useTax: false, taxName: "", taxAddress: "", taxId: "" });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof customerSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    
    if (editingCustomer) {
      const customerDoc = doc(db, "customers", editingCustomer.id);
      const updateData = { ...values, updatedAt: serverTimestamp() };
      updateDoc(customerDoc, updateData)
        .then(() => {
          toast({ title: "Customer updated successfully" });
          setIsDialogOpen(false);
        })
        .catch(error => {
          const permissionError = new FirestorePermissionError({ path: customerDoc.path, operation: 'update', requestResourceData: updateData });
          errorEmitter.emit('permission-error', permissionError);
          toast({ variant: "destructive", title: "Operation Failed", description: error.message });
        })
        .finally(() => setIsSubmitting(false));
    } else {
      const addData = { ...values, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      addDoc(collection(db, "customers"), addData)
        .then(() => {
          toast({ title: "Customer added successfully" });
          setIsDialogOpen(false);
        })
        .catch(error => {
          const permissionError = new FirestorePermissionError({ path: 'customers', operation: 'create', requestResourceData: addData });
          errorEmitter.emit('permission-error', permissionError);
          toast({ variant: "destructive", title: "Operation Failed", description: error.message });
        })
        .finally(() => setIsSubmitting(false));
    }
  };

  const handleDelete = (customerId: string) => {
    if (!db) return;
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    
    const customerDoc = doc(db, "customers", customerId);
    deleteDoc(customerDoc)
      .then(() => {
        toast({title: "Customer deleted successfully"});
      })
      .catch(error => {
        const permissionError = new FirestorePermissionError({ path: customerDoc.path, operation: 'delete' });
        errorEmitter.emit('permission-error', permissionError);
        toast({variant: "destructive", title: "Deletion Failed", description: error.message});
      });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
      <PageHeader title="Customer Management" description="Add, edit, and manage your customers.">
        <Button onClick={() => openDialog()}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Customer
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader><CardTitle>Customer List</CardTitle></CardHeader>
        <CardContent>
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
              {customers.map(customer => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.useTax ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDialog(customer)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(customer.id)} className="text-red-600">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit" : "Add"} Customer</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <div className="space-y-4 p-4 border rounded-md">
                    <FormField name="taxName" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="taxAddress" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="taxId" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Tax ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
