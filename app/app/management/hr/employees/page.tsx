"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MoreHorizontal, PlusCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS, USER_ROLES, USER_STATUSES } from "@/lib/constants";
import type { UserProfile } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { WithId } from "@/firebase/firestore/use-collection";

const userProfileSchema = z.object({
  displayName: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  department: z.enum(DEPARTMENTS).optional(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  personal: z.object({
    idCardNo: z.string().optional().default(''),
    address: z.string().optional().default(''),
    bank: z.object({
      bankName: z.string().optional().default(''),
      accountName: z.string().optional().default(''),
      accountNo: z.string().optional().default(''),
    }).optional(),
    emergencyContact: z.object({
      name: z.string().optional().default(''),
      relationship: z.string().optional().default(''),
      phone: z.string().optional().default(''),
    }).optional(),
  }).optional(),
  hr: z.object({
    salaryMonthly: z.coerce.number().optional(),
    payType: z.enum(["MONTHLY", "DAILY"]).optional(),
    startDate: z.string().optional().default(''),
    endDate: z.string().optional().default(''),
    ssoHospital: z.string().optional().default(''),
    note: z.string().optional().default(''),
  }).optional(),
});

type UserWithId = WithId<UserProfile>;

const UserCard = ({ user, onEdit, onDelete, isManager }: { user: UserWithId, onEdit: (user: UserWithId) => void, onDelete: (userId: string) => void, isManager: boolean }) => (
    <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{user.displayName}</CardTitle>
                {isManager && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(user)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(user.id)} className="text-destructive focus:text-destructive">
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <CardDescription>{user.phone}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm pt-0">
            <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium">{user.department || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium">{user.role}</span>
            </div>
             <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{user.status}</span>
            </div>
        </CardContent>
    </Card>
);

export default function ManagementHREmployeesPage() {
  const { db } = useFirebase();
  const { profile: loggedInUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithId | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const isManager = loggedInUser?.role === 'MANAGER';

  const form = useForm<z.infer<typeof userProfileSchema>>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "users"), orderBy("displayName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
      setUsers(usersData);
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Failed to load users" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);
  
  useEffect(() => {
    if (isDialogOpen) {
      if (editingUser) {
        form.reset({
          displayName: editingUser.displayName,
          phone: editingUser.phone,
          department: editingUser.department || undefined,
          role: editingUser.role,
          status: editingUser.status,
          personal: {
            idCardNo: editingUser.personal?.idCardNo || '',
            address: editingUser.personal?.address || '',
            bank: {
                bankName: editingUser.personal?.bank?.bankName || '',
                accountName: editingUser.personal?.bank?.accountName || '',
                accountNo: editingUser.personal?.bank?.accountNo || '',
            },
            emergencyContact: {
                name: editingUser.personal?.emergencyContact?.name || '',
                relationship: editingUser.personal?.emergencyContact?.relationship || '',
                phone: editingUser.personal?.emergencyContact?.phone || '',
            }
          },
          hr: {
              salaryMonthly: editingUser.hr?.salaryMonthly,
              payType: editingUser.hr?.payType,
              startDate: editingUser.hr?.startDate || '',
              endDate: editingUser.hr?.endDate || '',
              ssoHospital: editingUser.hr?.ssoHospital || '',
              note: editingUser.hr?.note || ''
          }
        });
      }
    } else {
        setEditingUser(null);
        form.reset({});
    }
  }, [isDialogOpen, editingUser, form]);


  const openDialog = (user: UserWithId) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const onSubmit = async (formValues: z.infer<typeof userProfileSchema>) => {
    if (!db || !editingUser) return;
    setIsSubmitting(true);
    
    try {
        const finalUpdate: {[key: string]: any} = {
            displayName: formValues.displayName,
            phone: formValues.phone,
            department: formValues.department || null,
            role: formValues.role,
            status: formValues.status,
            'personal.idCardNo': formValues.personal?.idCardNo || null,
            'personal.address': formValues.personal?.address || null,
            'personal.bank.bankName': formValues.personal?.bank?.bankName || null,
            'personal.bank.accountName': formValues.personal?.bank?.accountName || null,
            'personal.bank.accountNo': formValues.personal?.bank?.accountNo || null,
            'personal.emergencyContact.name': formValues.personal?.emergencyContact?.name || null,
            'personal.emergencyContact.relationship': formValues.personal?.emergencyContact?.relationship || null,
            'personal.emergencyContact.phone': formValues.personal?.emergencyContact?.phone || null,
            'hr.payType': formValues.hr?.payType || null,
            'hr.startDate': formValues.hr?.startDate || null,
            'hr.endDate': formValues.hr?.endDate || null,
            'hr.ssoHospital': formValues.hr?.ssoHospital || null,
            'hr.note': formValues.hr?.note || null,
            updatedAt: serverTimestamp()
        };
        
        if (isManager) {
            finalUpdate['hr.salaryMonthly'] = formValues.hr?.salaryMonthly === undefined || (formValues.hr.salaryMonthly as any) === '' ? null : Number(formValues.hr.salaryMonthly);
        }
        
        const userDoc = doc(db, "users", editingUser.id);
        await updateDoc(userDoc, finalUpdate);
        
        toast({ title: "User profile updated successfully" });
        setIsDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteRequest = (userId: string) => {
    setUserToDelete(userId);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !userToDelete) return;
    
    try {
        const userDoc = doc(db, "users", userToDelete);
        await deleteDoc(userDoc);
        toast({title: "User profile deleted successfully"});
    } catch(error: any) {
        toast({variant: "destructive", title: "Deletion Failed", description: error.message});
    } finally {
        setIsDeleteAlertOpen(false);
        setUserToDelete(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
        <PageHeader title="ผู้ใช้และพนักงาน" description="จัดการข้อมูลผู้ใช้และพนักงานทั้งหมด" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="mb-4"><PlusCircle className="mr-2 h-4 w-4" /> Add User</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ขั้นตอนการสร้างผู้ใช้</AlertDialogTitle>
              <AlertDialogDescription>
                หากต้องการเพิ่มผู้ใช้ใหม่ ให้ผู้ใช้ไปสมัครสมาชิกด้วยตนเองที่หน้า Sign Up
                <br /><br />
                เมื่อสร้างบัญชีแล้ว บัญชีจะปรากฏในรายการนี้พร้อมสถานะ "PENDING" จากนั้นคุณสามารถแก้ไขข้อมูลและเปลี่ยนสถานะเป็น "ACTIVE" เพื่อเปิดใช้งานบัญชีได้
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>ตกลง</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      
      <Card className="hidden sm:block">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {isManager && <TableHead><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length > 0 ? (
                users.map(user => (
                    <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell>{user.phone}</TableCell>
                    <TableCell>{user.department || 'N/A'}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.status}</TableCell>
                    {isManager && (
                        <TableCell>
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(user)}>Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteRequest(user.id)} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    )}
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={isManager ? 6 : 5} className="h-24 text-center text-muted-foreground">
                       No users found. New users will appear here after they sign up.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:hidden">
        {users.length > 0 ? (
            users.map(user => (
                <UserCard key={user.id} user={user} onEdit={openDialog} onDelete={handleDeleteRequest} isManager={isManager} />
            ))
        ) : (
            <Card className="text-center py-12">
                <CardHeader>
                    <CardTitle>No Users Found</CardTitle>
                    <CardDescription>New users will appear here after they sign up.</CardDescription>
                </CardHeader>
            </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent 
            className="sm:max-w-2xl flex flex-col max-h-[90vh]" 
            onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>Update the user's details below. Click save when you're done.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <div className="flex-1 overflow-y-auto -mx-6 px-6 py-4">
              <form id="edit-user-form-hr" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Account Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField name="displayName" control={form.control} render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="phone" control={form.control} render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <FormField name="department" control={form.control} render={({ field }) => (<FormItem><FormLabel>Department</FormLabel><Select onValueChange={field.onChange} value={field.value ?? ''}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{DEPARTMENTS.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                                <FormField name="role" control={form.control} render={({ field }) => (<FormItem><FormLabel>Role</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{USER_ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                                <FormField name="status" control={form.control} render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{USER_STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                            </div>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <FormField name="personal.idCardNo" control={form.control} render={({ field }) => (<FormItem><FormLabel>ID Card Number</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             <FormField name="personal.address" control={form.control} render={({ field }) => (<FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             <p className="font-medium text-sm">Bank Account</p>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                                 <FormField name="personal.bank.bankName" control={form.control} render={({ field }) => (<FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                 <FormField name="personal.bank.accountName" control={form.control} render={({ field }) => (<FormItem><FormLabel>Account Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                 <FormField name="personal.bank.accountNo" control={form.control} render={({ field }) => (<FormItem><FormLabel>Account No.</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             </div>
                             <p className="font-medium text-sm">Emergency Contact</p>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                                  <FormField name="personal.emergencyContact.name" control={form.control} render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                  <FormField name="personal.emergencyContact.relationship" control={form.control} render={({ field }) => (<FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                  <FormField name="personal.emergencyContact.phone" control={form.control} render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>HR Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField name="hr.startDate" control={form.control} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Date</FormLabel>
                                        <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField name="hr.endDate" control={form.control} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>End Date</FormLabel>
                                        <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                              </div>
                              <FormField
                                name="hr.salaryMonthly"
                                control={form.control}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Monthly Salary</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        disabled={!isManager}
                                        value={field.value ?? ''}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          field.onChange(value === '' ? undefined : Number(value));
                                        }}
                                      />
                                    </FormControl>
                                    {!isManager && <FormDescription>แก้เงินเดือนได้เฉพาะ Manager</FormDescription>}
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            <FormField name="hr.payType" control={form.control} render={({ field }) => (<FormItem><FormLabel>Pay Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="MONTHLY">Monthly</SelectItem><SelectItem value="DAILY">Daily</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                             <FormField name="hr.ssoHospital" control={form.control} render={({ field }) => (<FormItem><FormLabel>SSO Hospital</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             <FormField name="hr.note" control={form.control} render={({ field }) => (<FormItem><FormLabel>Note</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        </CardContent>
                    </Card>
              </form>
            </div>
            <DialogFooter className="flex-shrink-0 border-t pt-4 bg-background pb-6 -mx-6 px-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" form="edit-user-form-hr" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will delete the user's profile from the database. This does not delete their authentication account and cannot be undone.
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
