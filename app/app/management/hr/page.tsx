"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp, addDoc, where } from "firebase/firestore";
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
import { Loader2, MoreHorizontal, PlusCircle, Trash2, CalendarPlus, CheckCircle, XCircle, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS, USER_ROLES, USER_STATUSES, LeaveStatus, LEAVE_STATUSES, LEAVE_TYPES, LeaveType } from "@/lib/constants";
import type { UserProfile, HRHoliday as HRHolidayType, LeaveRequest, HRSettings } from "@/lib/types";
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
import { HRSettingsForm } from "@/components/hr-settings-form";
import { format, isBefore, startOfToday, parseISO, getYear, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, isSaturday, isSunday, subMonths, addMonths } from 'date-fns';
import { safeFormat } from '@/lib/date-utils';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { Badge } from "@/components/ui/badge";
import { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


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
    ssoHospital: z.string().optional().default(''),
    note: z.string().optional().default(''),
  }).optional(),
});

const holidaySchema = z.object({
  date: z.date({
    required_error: "A date is required.",
  }),
  name: z.string().min(1, "Holiday name is required."),
});

type UserWithId = WithId<UserProfile>;

const UserCard = ({ user, onEdit, onDelete }: { user: UserWithId, onEdit: (user: UserWithId) => void, onDelete: (userId: string) => void }) => (
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
                        <DropdownMenuItem onClick={() => onDelete(user.id)} className="text-destructive focus:text-destructive">
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
            'hr.ssoHospital': formValues.hr?.ssoHospital || null,
            'hr.note': formValues.hr?.note || null,
            updatedAt: serverTimestamp()
        };
        
        if (isManager) {
            finalUpdate['hr.salaryMonthly'] = formValues.hr?.salaryMonthly === undefined || formValues.hr.salaryMonthly === '' ? null : Number(formValues.hr.salaryMonthly);
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
                <TableHead>Salary</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
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
                    <TableCell>{user.hr?.salaryMonthly?.toLocaleString() || '-'}</TableCell>
                    <TableCell>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(user)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteRequest(user.id)} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                <UserCard key={user.id} user={user} onEdit={openDialog} onDelete={handleDeleteRequest} />
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

function HolidaysTab() {
  const { db } = useFirebase();
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof holidaySchema>>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      name: "",
      date: undefined
    }
  });

  const holidaysQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, 'hrHolidays'), orderBy('date', 'desc'));
  }, [db]);

  const { data: holidays, isLoading: isLoadingHolidays } = useCollection<HRHolidayType>(holidaysQuery);

  async function onSubmit(values: z.infer<typeof holidaySchema>) {
    if (!db) return;

    try {
      await addDoc(collection(db, 'hrHolidays'), {
        date: format(values.date, 'yyyy-MM-dd'),
        name: values.name,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Holiday Added', description: `${values.name} on ${format(values.date, 'PPP')} has been added.` });
      form.reset({ name: '', date: undefined });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  }

  async function deleteHoliday(holidayId: string) {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'hrHolidays', holidayId));
      toast({ title: 'Holiday Removed' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  }

  const today = startOfToday();

  return (
    <div className="grid gap-8 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Add Holiday</CardTitle>
            <CardDescription>Select a date and enter a name to add a new holiday.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarPlus className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => isBefore(date, today)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Holiday Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., New Year's Day" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                   {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Holiday
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Holiday List</CardTitle>
            <CardDescription>Upcoming and past holidays.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingHolidays ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      <Loader2 className="mx-auto animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : holidays && holidays.length > 0 ? (
                  holidays.map((holiday) => {
                    const holidayDate = parseISO(holiday.date);
                    const isPast = isBefore(holidayDate, today);
                    return (
                      <TableRow key={holiday.id} className={cn(isPast && "text-muted-foreground")}>
                        <TableCell className="font-medium">{format(holidayDate, 'dd MMM yyyy')}</TableCell>
                        <TableCell>{holiday.name}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isPast}
                                className={cn(isPast && "cursor-not-allowed")}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the holiday: <span className="font-semibold">{holiday.name}</span> on {format(holidayDate, 'PPP')}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteHoliday(holiday.id)} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No holidays added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeavesTab() {
  const { db } = useFirebase();
  const { profile: adminProfile } = useAuth();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [filters, setFilters] = useState({ status: 'ALL', userId: 'ALL' });
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingLeave, setApprovingLeave] = useState<LeaveRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
  
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), orderBy('displayName', 'asc')) : null, [db]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);

  const leavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), orderBy('createdAt', 'desc')) : null, [db]);
  const { data: allLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(leavesQuery);

  const isLoading = isLoadingSettings || isLoadingUsers || isLoadingLeaves;

  const { leaveSummary, filteredLeaves, yearOptions } = useMemo(() => {
    // 1. Get all possible years from leaves
    const years = new Set<number>();
    if (allLeaves) {
      allLeaves.forEach(leave => years.add(leave.year));
    }
    const currentYear = getYear(new Date());
    years.add(currentYear);
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    if (!allLeaves || !users) {
      return { leaveSummary: [], filteredLeaves: [], yearOptions: sortedYears };
    }

    // 2. Create a map of approved leave days per user for the selected year
    const approvedLeaveDaysMap = new Map<string, { SICK: number; BUSINESS: number; VACATION: number; TOTAL: number }>();
    allLeaves.forEach(leave => {
        if (leave.status === 'APPROVED' && leave.year === selectedYear) {
            if (!approvedLeaveDaysMap.has(leave.userId)) {
                approvedLeaveDaysMap.set(leave.userId, { SICK: 0, BUSINESS: 0, VACATION: 0, TOTAL: 0 });
            }
            const userLeave = approvedLeaveDaysMap.get(leave.userId)!;
            if (leave.leaveType in userLeave) {
                (userLeave as any)[leave.leaveType] += leave.days;
                userLeave.TOTAL += leave.days;
            }
        }
    });

    // 3. Create the final summary by mapping over all users
    const summary = users.map(user => {
        const userLeaveDays = approvedLeaveDaysMap.get(user.id) || { SICK: 0, BUSINESS: 0, VACATION: 0, TOTAL: 0 };
        return {
            userId: user.id,
            userName: user.displayName,
            ...userLeaveDays
        };
    });
    
    // 4. Filter leaves for the "All Requests" tab
    const filtered = allLeaves.filter(leave => 
      leave.year === selectedYear &&
      (filters.status === 'ALL' || leave.status === filters.status) &&
      (filters.userId === 'ALL' || leave.userId === filters.userId)
    );

    return { leaveSummary: summary, filteredLeaves: filtered, yearOptions: sortedYears };
  }, [allLeaves, users, selectedYear, filters]);

  const overLimitDetails = useMemo(() => {
    if (!approvingLeave || !hrSettings || !allLeaves || !users) return null;

    const leave = approvingLeave;
    const approvedLeavesThisYear = allLeaves.filter(l =>
        l.userId === leave.userId && l.year === leave.year && l.leaveType === leave.leaveType && l.status === 'APPROVED'
    );
    const daysTaken = approvedLeavesThisYear.reduce((sum, l) => sum + l.days, 0);

    const policy = hrSettings.leavePolicy?.leaveTypes?.[leave.leaveType];
    const entitlement = policy?.annualEntitlement ?? 0;
    
    if ((daysTaken + leave.days) > entitlement) {
        const salary = users.find(u => u.id === leave.userId)?.hr?.salaryMonthly;
        const deductionDays = policy?.overLimitHandling?.salaryDeductionBaseDays ?? 26;
        let deductionAmount = 0;
        if (policy?.overLimitHandling?.mode === 'DEDUCT_SALARY' && salary) {
            const overDays = (daysTaken + leave.days) - entitlement;
            deductionAmount = (salary / deductionDays) * overDays;
        }
        return { mode: policy?.overLimitHandling?.mode, amount: deductionAmount, days: (daysTaken + leave.days) - entitlement };
    }
    return null;
  }, [approvingLeave, hrSettings, allLeaves, users]);

  const handleApprove = async () => {
    if (!db || !adminProfile || !approvingLeave) return;

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'hrLeaves', approvingLeave.id), {
        status: 'APPROVED',
        approvedByName: adminProfile.displayName,
        approvedAt: serverTimestamp(),
        overLimit: !!overLimitDetails,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Leave Approved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
      setApprovingLeave(null);
    }
  };

  const handleReject = async () => {
    if (!db || !adminProfile || !rejectingLeave || !rejectReason) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'hrLeaves', rejectingLeave.id), {
        status: 'REJECTED',
        rejectedByName: adminProfile.displayName,
        rejectedAt: serverTimestamp(),
        rejectReason,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Leave Rejected' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Rejection Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
      setRejectingLeave(null);
      setRejectReason('');
    }
  };

  const getStatusVariant = (status: LeaveStatus) => {
    switch (status) {
      case 'SUBMITTED': return 'secondary';
      case 'APPROVED': return 'default';
      case 'REJECTED': return 'destructive';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <Tabs defaultValue="summary">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="requests">All Requests</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Leave Summary</CardTitle>
            <CardDescription>Total approved leave days for the selected year.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-end mb-4">
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Sick</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Vacation</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveSummary.length > 0 ? leaveSummary.map(s => (
                  <TableRow key={s.userId}>
                    <TableCell>{s.userName}</TableCell>
                    <TableCell>{s.SICK}</TableCell>
                    <TableCell>{s.BUSINESS}</TableCell>
                    <TableCell>{s.VACATION}</TableCell>
                    <TableCell className="font-bold">{s.TOTAL}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={5} className="text-center h-24">No approved leaves this year.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="requests" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>All Leave Requests</CardTitle>
            <CardDescription>Review and approve/reject leave requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilters(f => ({...f, status: v}))}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem key="status-all" value="ALL">All Statuses</SelectItem>{LEAVE_STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.userId} onValueChange={(v) => setFilters(f => ({...f, userId: v}))}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem key="user-all" value="ALL">All Employees</SelectItem>{users?.map(u=><SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeaves.length > 0 ? filteredLeaves.map(leave => (
                  <TableRow key={leave.id}>
                    <TableCell>{leave.userName}</TableCell>
                    <TableCell>{leave.leaveType}</TableCell>
                    <TableCell>{format(parseISO(leave.startDate), 'dd/MM/yy')} - {format(parseISO(leave.endDate), 'dd/MM/yy')}</TableCell>
                    <TableCell>{leave.days}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(leave.status)}>{leave.status}</Badge></TableCell>
                    <TableCell className="space-x-2">
                      {leave.status === 'SUBMITTED' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setApprovingLeave(leave)}><CheckCircle className="h-4 w-4 mr-2"/>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => setRejectingLeave(leave)}><XCircle className="h-4 w-4 mr-2"/>Reject</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6} className="text-center h-24">No requests match filters.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      <AlertDialog open={!!approvingLeave} onOpenChange={(open) => !open && setApprovingLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this leave request for <span className="font-bold">{approvingLeave?.userName}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {overLimitDetails && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-destructive">Leave Limit Exceeded</h4>
                        <p className="text-destructive/80 text-sm">Approving this will exceed the annual limit by {overLimitDetails.days} day(s).</p>
                        {overLimitDetails.mode === 'DEDUCT_SALARY' && (
                            <p className="text-destructive/80 text-sm">Estimated deduction: {overLimitDetails.amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</p>
                        )}
                    </div>
                </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!rejectingLeave} onOpenChange={(open) => !open && setRejectingLeave(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Reject Leave Request</DialogTitle>
                <DialogDescription>Please provide a reason for rejecting the request.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..."/>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setRejectingLeave(null)} disabled={isSubmitting}>Cancel</Button>
                <Button variant="destructive" onClick={handleReject} disabled={isSubmitting || !rejectReason}>
                     {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Confirm Reject'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function AttendanceSummaryTab() {
    const { db } = useFirebase();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const dateRange: DateRange | undefined = useMemo(() => ({
        from: startOfMonth(currentMonth),
        to: endOfMonth(currentMonth),
    }), [currentMonth]);

    const usersQuery = useMemo(() => db ? query(collection(db, 'users'), where('status', '==', 'ACTIVE'), orderBy('displayName', 'asc')) : null, [db]);
    const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);

    const attendanceQuery = useMemo(() => {
        if (!db || !dateRange?.from || !dateRange?.to) return null;
        return query(collection(db, 'attendance'), 
            where('timestamp', '>=', dateRange.from), 
            where('timestamp', '<=', dateRange.to),
            orderBy('timestamp', 'asc')
        );
    }, [db, dateRange]);
    const { data: attendance, isLoading: isLoadingAttendance, error: attendanceError } = useCollection<any>(attendanceQuery);

    const approvedLeavesQuery = useMemo(() => db ? query(collection(db, 'hrLeaves'), where('status', '==', 'APPROVED')) : null, [db]);
    const { data: approvedLeaves, isLoading: isLoadingLeaves } = useCollection<LeaveRequest>(approvedLeavesQuery);

    const holidaysQuery = useMemo(() => db ? query(collection(db, 'hrHolidays')) : null, [db]);
    const { data: holidays, isLoading: isLoadingHolidays } = useCollection<HRHolidayType>(holidaysQuery);

    const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
    const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
    
    const isLoading = isLoadingUsers || isLoadingAttendance || isLoadingLeaves || isLoadingHolidays || isLoadingSettings;

    const { days, summaryData } = useMemo(() => {
        if (isLoading || !dateRange?.from || !dateRange.to || !users || !attendance || !approvedLeaves || !holidays || !hrSettings) {
            return { days: [], summaryData: [] };
        }

        const intervalDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        const holidaysMap = new Map(holidays.map(h => [h.date, h.name]));
        const leavesMap = new Map<string, LeaveRequest[]>();
        approvedLeaves.forEach(leave => {
            if (!leavesMap.has(leave.userId)) leavesMap.set(leave.userId, []);
            leavesMap.get(leave.userId)!.push(leave);
        });
        
        const attendanceByUser = new Map<string, any[]>();
        attendance.forEach(att => {
            if (!attendanceByUser.has(att.userId)) attendanceByUser.set(att.userId, []);
            attendanceByUser.get(att.userId)!.push(att);
        });

        const [workStartHour, workStartMinute] = (hrSettings.workStart || '08:00').split(':').map(Number);
        const graceMinutes = hrSettings.graceMinutes || 0;

        const processedData = users.map(user => {
            const dailyStatuses = intervalDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                
                if (holidaysMap.has(dayStr)) return { status: 'HOLIDAY', name: holidaysMap.get(dayStr) };
                if (isSaturday(day) || isSunday(day)) return { status: 'WEEKEND' };

                const userLeaves = leavesMap.get(user.id) || [];
                const onLeave = userLeaves.find(leave => 
                    isWithinInterval(day, { start: parseISO(leave.startDate), end: parseISO(leave.endDate) })
                );
                if (onLeave) return { status: 'LEAVE', type: onLeave.leaveType };
                
                const userAttendanceToday = (attendanceByUser.get(user.id) || []).filter(att => 
                    att.timestamp && format(att.timestamp.toDate(), 'yyyy-MM-dd') === dayStr
                );
                
                const clockIns = userAttendanceToday.filter(a => a.type === 'IN').map(a => a.timestamp.toDate()).sort((a, b) => a.getTime() - b.getTime());
                const clockOuts = userAttendanceToday.filter(a => a.type === 'OUT').map(a => a.timestamp.toDate()).sort((a, b) => a.getTime() - b.getTime());

                if (clockIns.length === 0) return { status: 'ABSENT' };

                const firstClockIn = clockIns[0];
                const lastClockOut = clockOuts.length > 0 ? clockOuts[clockOuts.length - 1] : undefined;
                
                let status: 'PRESENT' | 'LATE' = 'PRESENT';
                const clockInTime = firstClockIn.getHours() * 60 + firstClockIn.getMinutes();
                const workStartTime = workStartHour * 60 + workStartMinute + graceMinutes;
                if (clockInTime > workStartTime) {
                    status = 'LATE';
                }
                
                return { status, clockIn: firstClockIn, clockOut: lastClockOut };
            });
            return { user, dailyStatuses };
        });

        return { days: intervalDays, summaryData: processedData };
    }, [isLoading, dateRange, users, attendance, approvedLeaves, holidays, hrSettings]);

    useEffect(() => {
        if (attendanceError?.message?.includes('requires an index')) {
          const urlMatch = attendanceError.message.match(/https?:\/\/[^\s]+/);
          toast({
            variant: "destructive",
            title: "Database Index Required",
            description: `The attendance query needs an index. Please create it in Firebase. ${urlMatch ? `Link: ${urlMatch[0]}`: ''}`,
            duration: 20000,
          });
        }
    }, [attendanceError, toast]);
    
    const getStatusContent = (dayStatus: any) => {
        let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
        let text: string | React.ReactNode = '';
        let tooltipContent = '';

        switch(dayStatus.status) {
            case 'PRESENT':
                variant = 'default';
                text = 'P';
                tooltipContent = `Present. In: ${safeFormat(dayStatus.clockIn, 'HH:mm')}${dayStatus.clockOut ? `, Out: ${safeFormat(dayStatus.clockOut, 'HH:mm')}`: ''}`;
                break;
            case 'LATE':
                variant = 'destructive';
                text = 'L';
                tooltipContent = `Late. In: ${safeFormat(dayStatus.clockIn, 'HH:mm')}`;
                break;
            case 'ABSENT': variant = 'destructive'; text = 'A'; tooltipContent = 'Absent'; break;
            case 'LEAVE':
                variant = 'secondary';
                const leaveTypeMap: Record<LeaveType, string> = {
                    SICK: "ป่วย",
                    BUSINESS: "กิจ",
                    VACATION: "พัก",
                };
                text = leaveTypeMap[dayStatus.type as LeaveType] || "ลา";
                tooltipContent = `On Leave (${dayStatus.type})`;
                break;
            case 'HOLIDAY': variant = 'secondary'; text = 'H'; tooltipContent = `Holiday: ${dayStatus.name}`; break;
            case 'WEEKEND': return <div className="w-full h-8 flex items-center justify-center text-muted-foreground text-xs"></div>;
            default: return null;
        }

        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant={variant} className="w-8 h-8 flex items-center justify-center cursor-default">{text}</Badge>
                    </TooltipTrigger>
                    <TooltipContent><p>{tooltipContent}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Attendance Summary</CardTitle>
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <CardDescription>Daily attendance summary for all active employees.</CardDescription>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="font-semibold text-lg text-center w-32">{format(currentMonth, 'MMMM yyyy')}</span>
                        <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                 {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
                ) : attendanceError ? (
                    <div className="text-destructive text-center p-8">Error loading attendance data. A database index might be required. Check console for details.</div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 bg-background min-w-[150px]">Employee</TableHead>
                                {days.map(day => <TableHead key={day.toString()} className="text-center">{format(day, 'd')}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summaryData.map(({ user, dailyStatuses }) => (
                            <TableRow key={user.id}>
                                <TableCell className="sticky left-0 bg-background font-medium">{user.displayName}</TableCell>
                                {dailyStatuses.map((status, index) => (
                                <TableCell key={index} className="text-center p-1">
                                    {getStatusContent(status)}
                                </TableCell>
                                ))}
                            </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                 )}
            </CardContent>
        </Card>
    );
}

export default function ManagementHRPage() {
    return (
        <>
            <PageHeader title="บริหารงานบุคคล" description="จัดการข้อมูลพนักงานและการลา" />
            <Tabs defaultValue="employees" className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="employees">ผู้ใช้และพนักงาน</TabsTrigger>
                    <TabsTrigger value="settings">ตั้งค่า HR</TabsTrigger>
                    <TabsTrigger value="holidays">วันหยุด</TabsTrigger>
                    <TabsTrigger value="leaves">วันลา</TabsTrigger>
                    <TabsTrigger value="attendance-summary">สรุปลงเวลา</TabsTrigger>
                </TabsList>
                <TabsContent value="employees">
                    <EmployeesTab />
                </TabsContent>
                 <TabsContent value="settings">
                    <HRSettingsForm />
                </TabsContent>
                <TabsContent value="holidays">
                     <HolidaysTab />
                </TabsContent>
                <TabsContent value="leaves">
                     <LeavesTab />
                </TabsContent>
                <TabsContent value="attendance-summary">
                     <AttendanceSummaryTab />
                </TabsContent>
            </Tabs>
        </>
    );
}



    
