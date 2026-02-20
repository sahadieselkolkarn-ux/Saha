"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MoreHorizontal, PlusCircle, Upload, Search, Edit, Eye, Trash2, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const customerSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อลูกค้า"),
  phone: z.string().min(1, "กรุณากรอกเบอร์โทรศัพท์"),
  detail: z.string().optional().default(""),
  useTax: z.boolean().default(false),
  taxName: z.string().optional(),
  taxAddress: z.string().optional(),
  taxId: z.string().optional(),
  taxPhone: z.string().optional(),
  taxBranchType: z.enum(['HEAD_OFFICE', 'BRANCH']).optional(),
  taxBranchNo: z.string().optional(),
  acquisitionSource: z.enum(ACQUISITION_SOURCES).optional().nullable(),
}).refine(data => !data.useTax || (data.taxName && data.taxAddress && data.taxId), {
  message: "กรุณากรอกข้อมูลภาษีให้ครบถ้วนเมื่อเลือก 'ต้องการใบกำกับภาษี'",
  path: ["taxName"], 
}).refine(data => !data.useTax || data.taxBranchType !== 'BRANCH' || (data.taxBranchNo && data.taxBranchNo.length === 5), {
  message: "กรุณาระบุรหัสสาขา 5 หลัก",
  path: ["taxBranchNo"],
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
                <span className="text-muted-foreground">ใช้ใบกำกับภาษี</span>
                <span className="font-medium">{customer.useTax ? "ใช่" : "ไม่"}</span>
            </div>
             {customer.detail && (
                <div className="border-t pt-2">
                    <p className="text-muted-foreground">รายละเอียด:</p>
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
      taxPhone: "",
      taxBranchType: 'HEAD_OFFICE',
      taxBranchNo: '00000',
    },
  });
  
  const useTax = form.watch("useTax");
  const taxBranchType = form.watch("taxBranchType");

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
      setLoading(false);
    },
    async (error: any) => {
      if (error.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: 'customers',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      } else {
        toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลลูกค้าได้" });
      }
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
            name: editingCustomer.name || "",
            phone: editingCustomer.phone || "",
            detail: editingCustomer.detail || "",
            useTax: editingCustomer.useTax || false,
            taxName: editingCustomer.taxName || "",
            taxAddress: editingCustomer.taxAddress || "",
            taxId: editingCustomer.taxId || "",
            taxPhone: editingCustomer.taxPhone || editingCustomer.phone || "",
            taxBranchType: editingCustomer.taxBranchType || 'HEAD_OFFICE',
            taxBranchNo: editingCustomer.taxBranchNo || '00000',
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
        taxPhone: "",
        taxBranchType: 'HEAD_OFFICE',
        taxBranchNo: '00000',
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
    
    const customerDoc = doc(db, "customers", editingCustomer.id);
    const updateData = { 
      ...values, 
      updatedAt: serverTimestamp(),
      taxName: values.useTax ? values.taxName : "",
      taxAddress: values.useTax ? values.taxAddress : "",
      taxId: values.useTax ? values.taxId : "",
      taxPhone: values.useTax ? values.taxPhone : "",
      taxBranchType: values.useTax ? values.taxBranchType : null,
      taxBranchNo: values.useTax && values.taxBranchType === 'BRANCH' ? values.taxBranchNo : (values.taxBranchType === 'HEAD_OFFICE' ? '00000' : null),
    };

    updateDoc(customerDoc, updateData)
      .then(() => {
        toast({ title: "อัปเดตข้อมูลลูกค้าสำเร็จ" });
        setIsDialogOpen(false);
      })
      .catch(async (error: any) => {
        if (error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: customerDoc.path,
            operation: 'update',
            requestResourceData: updateData,
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        } else {
          toast({ variant: "destructive", title: "บันทึกไม่สำเร็จ", description: error.message });
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleDeleteRequest = (customerId: string) => {
    setCustomerToDelete(customerId);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !customerToDelete) return;
    
    const customerDoc = doc(db, "customers", customerToDelete);
    deleteDoc(customerDoc)
      .then(() => {
        toast({title: "ลบข้อมูลลูกค้าเรียบร้อยแล้ว"});
      })
      .catch(async (error: any) => {
        if (error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: customerDoc.path,
            operation: 'delete',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        } else {
          toast({variant: "destructive", title: "ไม่สามารถลบได้", description: error.message});
        }
      })
      .finally(() => {
        setIsDeleteAlertOpen(false);
        setCustomerToDelete(null);
      });
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
                <TableHead>ชื่อ</TableHead>
                <TableHead>เบอร์โทร</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
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
                        {searchTerm ? "ไม่พบข้อมูลที่ตรงกับการค้นหา" : "ยังไม่มีข้อมูลลูกค้า"}
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
                    หน้า {currentPage + 1} จาก {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 0}
                    >
                        ก่อนหน้า
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages - 1}
                    >
                        ถัดไป
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
                <CardTitle>{searchTerm ? "ไม่พบผลลัพธ์" : "ยังไม่มีข้อมูลลูกค้า"}</CardTitle>
                <CardDescription>{searchTerm ? "กรุณาลองค้นหาด้วยคำอื่น" : "เริ่มต้นด้วยการเพิ่มลูกค้าใหม่เข้าระบบ"}</CardDescription>
            </CardHeader>
        </Card>
        )}
         {totalPages > 1 && (
             <div className="flex w-full justify-between items-center mt-4">
                <span className="text-sm text-muted-foreground">
                    หน้า {currentPage + 1} จาก {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 0}
                    >
                        ก่อนหน้า
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages - 1}
                    >
                        ถัดไป
                    </Button>
                </div>
            </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent 
            className="sm:max-w-[600px] grid grid-rows-[auto_1fr_auto] max-h-[90vh] p-0 overflow-hidden"
            onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
        >
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>แก้ไขข้อมูลลูกค้า</DialogTitle>
            <DialogDescription>อัปเดตข้อมูลลูกค้าและรายละเอียดภาษี</DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto px-6">
            <Form {...form}>
                <form id="edit-customer-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField name="name" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>ชื่อลูกค้า</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="phone" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>เบอร์โทรศัพท์</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
                    <FormItem><FormLabel>รายละเอียดเพิ่มเติม</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField name="useTax" control={form.control} render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-muted/20">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer font-bold text-primary">ต้องการใบกำกับภาษี (Use Tax Invoice)</FormLabel>
                        <FormMessage />
                    </div>
                    </FormItem>
                )} />

                {useTax && (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/50 border-primary/20 mb-4 animate-in fade-in slide-in-from-top-1">
                        <h4 className="text-sm font-bold text-primary uppercase tracking-wider border-b pb-2">รายละเอียดสำหรับการออกใบกำกับภาษี</h4>
                        
                        <FormField name="taxName" control={form.control} render={({ field }) => (
                            <FormItem><FormLabel>ชื่อในใบกำกับภาษี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="ชื่อบริษัท หรือ ชื่อ-นามสกุล" /></FormControl><FormMessage /></FormItem>
                        )} />
                        
                        <FormField name="taxAddress" control={form.control} render={({ field }) => (
                            <FormItem><FormLabel>ที่อยู่ในใบกำกับภาษี</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="ระบุเลขที่บ้าน ถนน แขวง/ตำบล เขต/อำเภอ..." /></FormControl><FormMessage /></FormItem>
                        )} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField name="taxId" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>เลขประจำตัวผู้เสียภาษี (Tax ID)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="เลข 13 หลัก" /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField name="taxPhone" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>เบอร์โทรศัพท์ (สำหรับบิล)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="ระบุเบอร์โทร" /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>

                        <FormField
                            control={form.control}
                            name="taxBranchType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>สถานะสถานประกอบการ</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex flex-col space-y-1"
                                    >
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="HEAD_OFFICE" /></FormControl>
                                        <Label className="font-normal cursor-pointer">สำนักงานใหญ่</Label>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="BRANCH" /></FormControl>
                                        <Label className="font-normal cursor-pointer">สาขา</Label>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                </FormItem>
                            )}
                        />

                        {taxBranchType === 'BRANCH' && (
                            <FormField name="taxBranchNo" control={form.control} render={({ field }) => (
                                <FormItem className="animate-in fade-in slide-in-from-left-1">
                                    <FormLabel>รหัสสาขา (5 หลัก)</FormLabel>
                                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="เช่น 00001" maxLength={5} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        )}
                    </div>
                )}
                </form>
            </Form>
          </div>

          <DialogFooter className="border-t p-6">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button type="submit" form="edit-customer-form" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} บันทึกการเปลี่ยนแปลง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการลบข้อมูล?</AlertDialogTitle>
                <AlertDialogDescription>
                    คุณกำลังจะลบข้อมูลลูกค้ารายนี้ออกจากระบบอย่างถาวร การกระทำนี้ไม่สามารถย้อนกลับได้
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">ลบข้อมูล</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
