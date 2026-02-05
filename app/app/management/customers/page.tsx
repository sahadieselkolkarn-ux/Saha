"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp, where } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MoreHorizontal, PlusCircle, Upload, Search, Edit, Eye, Trash2 } from "lucide-react";
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
import { useAuth } from "@/context/auth-context";
import { ACQUISITION_SOURCES } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
  acquisitionSource: z.enum(ACQUISITION_SOURCES).optional().nullable(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "Tax information is required when 'Use Tax Invoice' is checked",
  path: ["taxName"], 
});

const CustomerCard = ({ customer, onEdit, onDelete, isManagerOrAdmin, isAdmin }: { customer: Customer, onEdit: (customer: Customer) => void, onDelete: (customerId: string) => void, isManagerOrAdmin: boolean, isAdmin: boolean }) => (
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
                        <DropdownMenuItem onClick={() => onEdit(customer)}><Eye className="mr-2 h-4 w-4"/>ดู</DropdownMenuItem>
                        {isManagerOrAdmin && <DropdownMenuItem onClick={() => onEdit(customer)}><Edit className="mr-2 h-4 w-4"/>แก้ไข</DropdownMenuItem>}
                        {isAdmin && <DropdownMenuItem onClick={() => onDelete(customer.id)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>ลบ</DropdownMenuItem>}
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

function AllCustomersTab({ searchTerm, isManagerOrAdmin, isAdmin }: { searchTerm: string, isManagerOrAdmin: boolean, isAdmin: boolean }) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;

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
  
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter) ||
      customer.phone.includes(searchTerm) ||
      (customer.detail || "").toLowerCase().includes(lowercasedFilter)
    );
  }, [customers, searchTerm]);

  const paginatedCustomers = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredCustomers.slice(start, end);
  }, [filteredCustomers, currentPage]);

  const totalPages = Math.ceil(filteredCustomers.length / PAGE_SIZE);

  useEffect(() => {
    if (isDialogOpen) {
      if (editingCustomer) {
        form.reset({
            ...editingCustomer,
            acquisitionSource: editingCustomer.acquisitionSource || null
        });
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
        acquisitionSource: null
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
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCustomers.length > 0 ? (
                paginatedCustomers.map(customer => (
                    <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell className="max-w-sm truncate">{customer.detail || '-'}</TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(customer)}><Eye className="mr-2 h-4 w-4"/>ดู</DropdownMenuItem>
                                {isManagerOrAdmin && <DropdownMenuItem onClick={() => openEditDialog(customer)}><Edit className="mr-2 h-4 w-4"/>แก้ไข</DropdownMenuItem>}
                                {isAdmin && <DropdownMenuItem onClick={() => handleDeleteRequest(customer.id)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>ลบ</DropdownMenuItem>}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        {searchTerm ? "No customers match your search." : "No customers found."}
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <CardFooter>
            <div className="flex w-full justify-between items-center">
                <span className="text-sm text-muted-foreground">
                    Page {currentPage + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 0}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages - 1}
                    >
                        Next
                    </Button>
                </div>
            </div>
          </CardFooter>
        )}
      </Card>

      <div className="grid gap-4 sm:hidden">
        {paginatedCustomers.length > 0 ? (
          paginatedCustomers.map(customer => (
            <CustomerCard key={customer.id} customer={customer} onEdit={openEditDialog} onDelete={handleDeleteRequest} isManagerOrAdmin={isManagerOrAdmin} isAdmin={isAdmin} />
          ))
        ) : (
          <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>{searchTerm ? "No Results" : "No Customers Found"}</CardTitle>
                <CardDescription>{searchTerm ? "No customers match your search." : "Get started by adding a new customer."}</CardDescription>
            </CardHeader>
        </Card>
        )}
         {totalPages > 1 && (
             <div className="flex w-full justify-between items-center mt-4">
                <span className="text-sm text-muted-foreground">
                    Page {currentPage + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 0}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages - 1}
                    >
                        Next
                    </Button>
                </div>
            </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent 
            className="sm:max-w-[600px] flex flex-col max-h-[90vh]"
            onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Update the details below.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <Form {...form}>
                <form id="edit-customer-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField name="name" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="phone" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField
                    control={form.control}
                    name="acquisitionSource"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>แหล่งที่มาลูกค้า (Marketing Source)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "NONE"}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกช่องทาง..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="NONE">-- ไม่ระบุ --</SelectItem>
                                <SelectItem value="REFERRAL">ลูกค้าแนะนำ</SelectItem>
                                <SelectItem value="GOOGLE">Google</SelectItem>
                                <SelectItem value="FACEBOOK">Facebook</SelectItem>
                                <SelectItem value="TIKTOK">Tiktok</SelectItem>
                                <SelectItem value="YOUTUBE">Youtube</SelectItem>
                                <SelectItem value="OTHER">อื่นๆ</SelectItem>
                            </SelectContent>
                        </Select>
                        </FormItem>
                    )}
                />

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
                </form>
            </Form>
          </ScrollArea>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" form="edit-customer-form" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
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


function TaxCustomersTab({ searchTerm }: { searchTerm: string }) {
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

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter) ||
      customer.phone.includes(searchTerm) ||
      (customer.detail || "").toLowerCase().includes(lowercasedFilter) ||
      customer.taxId?.toLowerCase().includes(lowercasedFilter)
    );
  }, [customers, searchTerm]);
  
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
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell>{customer.taxId}</TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        {searchTerm ? "No customers match your search." : "ไม่พบข้อมูลลูกค้าที่ใช้ภาษี"}
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
  )
}

function GeneralCustomersTab({ searchTerm }: { searchTerm: string }) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), where("useTax", "==", false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      customersData.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(customersData);
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Failed to load general customers" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);
  
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter) ||
      customer.phone.includes(searchTerm) ||
      (customer.detail || "").toLowerCase().includes(lowercasedFilter)
    );
  }, [customers, searchTerm]);

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                        {searchTerm ? "No customers match your search." : "ไม่พบข้อมูลลูกค้าทั่วไป"}
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
    const { profile } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("all");

    const isManagerOrAdmin = useMemo(() => profile?.role === 'ADMIN' || profile?.role === 'MANAGER', [profile]);
    const isAdmin = useMemo(() => profile?.role === 'ADMIN', [profile]);

    const placeholder = useMemo(() => {
        if (activeTab === 'tax') return "Search name, phone, detail, or Tax ID...";
        return "Search by name, phone, or detail...";
    }, [activeTab]);

    return (
        <>
            <PageHeader title="การจัดการลูกค้า" description="จัดการข้อมูลลูกค้าทั้งหมด">
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/app/management/customers/import">
                            <Upload className="mr-2 h-4 w-4" />
                            Import Customers
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/app/office/customers/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Customer
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Tabs defaultValue="all" onValueChange={setActiveTab} className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <TabsList>
                        <TabsTrigger value="all">รายชื่อลูกค้าทั้งหมด</TabsTrigger>
                        <TabsTrigger value="tax">ลูกค้าใช้ภาษี</TabsTrigger>
                        <TabsTrigger value="general">ลูกค้าทั่วไป</TabsTrigger>
                    </TabsList>
                    <div className="relative w-full sm:w-auto sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={placeholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                <TabsContent value="all">
                    <AllCustomersTab searchTerm={searchTerm} isManagerOrAdmin={isManagerOrAdmin} isAdmin={isAdmin} />
                </TabsContent>
                <TabsContent value="tax">
                    <TaxCustomersTab searchTerm={searchTerm} />
                </TabsContent>
                 <TabsContent value="general">
                    <GeneralCustomersTab searchTerm={searchTerm}/>
                </TabsContent>
            </Tabs>
        </>
    );
}
