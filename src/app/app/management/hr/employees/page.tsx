"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MoreHorizontal, PlusCircle } from "lucide-react";
import type { Employee } from "@/lib/types";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().min(1, "Address is required"),
  idCardNumber: z.string().min(1, "ID Card Number is required"),
  bankAccount: z.string().min(1, "Bank Account is required"),
  emergencyContact: z.string().min(1, "Emergency Contact is required"),
  notes: z.string().optional().default(""),
});

export default function ManagementHREmployeesPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      idCardNumber: "",
      bankAccount: "",
      emergencyContact: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      setEmployees(employeesData);
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Failed to load employees" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const openDialog = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    if (employee) {
        form.reset(employee);
    } else {
        form.reset({
            name: "",
            phone: "",
            address: "",
            idCardNumber: "",
            bankAccount: "",
            emergencyContact: "",
            notes: "",
        });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof employeeSchema>) => {
    if (!db) return;
    setIsSubmitting(true);
    
    if (editingEmployee) {
      const employeeDoc = doc(db, "employees", editingEmployee.id);
      const updateData = { ...values, updatedAt: serverTimestamp() };
      updateDoc(employeeDoc, updateData)
        .then(() => {
          toast({ title: "Employee updated successfully" });
          setIsDialogOpen(false);
        })
        .catch(error => {
          toast({ variant: "destructive", title: "Update Failed", description: error.message });
        })
        .finally(() => setIsSubmitting(false));
    } else {
      const addData = { ...values, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      addDoc(collection(db, "employees"), addData)
        .then(() => {
          toast({ title: "Employee added successfully" });
          setIsDialogOpen(false);
        })
        .catch(error => {
          toast({ variant: "destructive", title: "Creation Failed", description: error.message });
        })
        .finally(() => setIsSubmitting(false));
    }
  };

  const handleDelete = (employeeId: string) => {
    if (!db) return;
    if (!window.confirm("Are you sure you want to delete this employee? This action cannot be undone.")) return;
    
    const employeeDoc = doc(db, "employees", employeeId);
    deleteDoc(employeeDoc)
      .then(() => {
        toast({title: "Employee deleted successfully"});
      })
      .catch(error => {
        toast({variant: "destructive", title: "Deletion Failed", description: error.message});
      });
  };

  if (loading) {
    return (
        <>
            <PageHeader title="ข้อมูลพนักงาน" description="จัดการข้อมูลพนักงานทั้งหมด" />
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
        </>
    );
  }

  return (
    <>
      <PageHeader title="ข้อมูลพนักงาน" description="จัดการข้อมูลพนักงานทั้งหมด">
        <Button onClick={() => openDialog()}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader><CardTitle>Employee List</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length > 0 ? (
                employees.map(employee => (
                    <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.phone}</TableCell>
                    <TableCell className="line-clamp-1">{employee.address}</TableCell>
                    <TableCell>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(employee)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(employee.id)} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No employees found. <Button variant="link" className="p-0 h-auto" onClick={() => openDialog()}>Add the first one.</Button>
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit" : "Add"} Employee</DialogTitle>
            <DialogDescription>Fill in the employee's details below.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto pr-6">
              <FormField name="name" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="phone" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="address" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="idCardNumber" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>ID Card Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField name="bankAccount" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Bank Account</FormLabel><FormControl><Input placeholder="e.g., KBank 123-4-56789-0" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField name="emergencyContact" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Emergency Contact</FormLabel><FormControl><Input placeholder="e.g., Name (Relation) - 08X-XXX-XXXX" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="notes" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter className="sticky bottom-0 bg-background pt-4 pb-0 -mx-6 px-6">
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
