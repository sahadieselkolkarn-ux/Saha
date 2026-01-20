"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MoreHorizontal, PlusCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


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
    salary: z.coerce.number().optional(),
    ssoHospital: z.string().optional().default(''),
    note: z.string().optional().default(''),
  }).optional(),
});

const UserCard = ({ user, onEdit, onDelete }: { user: UserProfile, onEdit: (user: UserProfile) => void, onDelete: (userId: string) => void }) => (
    <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{user.displayName}</CardTitle>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(user)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(user.uid)} className="text-destructive focus:text-destructive">
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
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

function EmployeesTab() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const form = useForm<z.infer<typeof userProfileSchema>>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "users"), orderBy("displayName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
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
              salary: editingUser.hr?.salary,
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


  const openDialog = (user: UserProfile) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof userProfileSchema>) => {
    if (!db || !editingUser) return;
    setIsSubmitting(true);
    
    try {
        const updateData: {[key: string]: any} = {
            ...values,
            department: values.department || null,
            personal: {
                idCardNo: values.personal?.idCardNo || null,
                address: values.personal?.address || null,
                bank: {
                    bankName: values.personal?.bank?.bankName || null,
                    accountName: values.personal?.bank?.accountName || null,
                    accountNo: values.personal?.bank?.accountNo || null,
                },
                emergencyContact: {
                    name: values.personal?.emergencyContact?.name || null,
                    relationship: values.personal?.emergencyContact?.relationship || null,
                    phone: values.personal?.emergencyContact?.phone || null,
                }
            },
            hr: {
                salary: values.hr?.salary === undefined || values.hr.salary === '' ? null : values.hr.salary,
                ssoHospital: values.hr?.ssoHospital || null,
                note: values.hr?.note || null
            },
            updatedAt: serverTimestamp()
        };
        
        const userDoc = doc(db, "users", editingUser.uid);

        await updateDoc(userDoc, updateData);
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
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length > 0 ? (
                users.map(user => (
                    <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell>{user.phone}</TableCell>
                    <TableCell>{user.department || 'N/A'}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.status}</TableCell>
                    <TableCell>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(user)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteRequest(user.uid)} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
                <UserCard key={user.uid} user={user} onEdit={openDialog} onDelete={handleDeleteRequest} />
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
            className="sm:max-w-2xl" 
            onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>Update the user's details below. Click save when you're done.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-6 pr-6">
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
                              <FormField
                                name="hr.salary"
                                control={form.control}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Salary</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        value={field.value ?? ''}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          field.onChange(value === '' ? undefined : Number(value));
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                             <FormField name="hr.ssoHospital" control={form.control} render={({ field }) => (<FormItem><FormLabel>SSO Hospital</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                             <FormField name="hr.note" control={form.control} render={({ field }) => (<FormItem><FormLabel>Note</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        </CardContent>
                    </Card>
                </div>
              </ScrollArea>
              <DialogFooter className="pt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
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

export default function ManagementHRPage() {
    return (
        <>
            <PageHeader title="บริหารงานบุคคล" description="จัดการข้อมูลพนักงานและการลา" />
            <Tabs defaultValue="employees" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="employees">ผู้ใช้และพนักงาน</TabsTrigger>
                    <TabsTrigger value="holidays">วันหยุด</TabsTrigger>
                    <TabsTrigger value="leaves">วันลา</TabsTrigger>
                    <TabsTrigger value="attendance-summary">สรุปลงเวลา</TabsTrigger>
                </TabsList>
                <TabsContent value="employees">
                    <EmployeesTab />
                </TabsContent>
                <TabsContent value="holidays">
                     <Card>
                        <CardHeader>
                            <CardTitle>วันหยุด</CardTitle>
                            <CardDescription>จัดการวันหยุดประจำปีและวันหยุดพิเศษ</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="leaves">
                     <Card>
                        <CardHeader>
                            <CardTitle>วันลา</CardTitle>
                            <CardDescription>จัดการและดูประวัติการลาของพนักงาน</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="attendance-summary">
                     <Card>
                        <CardHeader>
                            <CardTitle>สรุปลงเวลา</CardTitle>
                            <CardDescription>สรุปข้อมูลการลงเวลาทำงานของพนักงาน</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </>
    );
}
