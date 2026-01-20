"use client";

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addDoc, collection, query, where, orderBy, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { DateRange } from 'react-day-picker';
import { format, differenceInCalendarDays, getYear, isBefore } from 'date-fns';

import { useFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LEAVE_TYPES, type LeaveType, type LeaveStatus } from '@/lib/constants';
import type { LeaveRequest } from '@/lib/types';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Calendar as CalendarIcon, Send, Trash2 } from 'lucide-react';

const leaveRequestSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES, { required_error: 'Please select a leave type.' }),
  dateRange: z.object({
    from: z.date({ required_error: 'Start date is required.' }),
    to: z.date().optional(),
  }),
  reason: z.string().min(1, 'Reason is required.'),
}).refine(data => {
    if (data.dateRange.from && data.dateRange.to) {
        return !isBefore(data.dateRange.to, data.dateRange.from);
    }
    return true;
}, {
    message: 'End date cannot be before start date.',
    path: ['dateRange', 'to'],
});

export default function MyLeavesPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof leaveRequestSchema>>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      reason: '',
    },
  });

  const leavesQuery = useMemo(() => {
    if (!db || !profile) return null;
    return query(
      collection(db, 'hrLeaves'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, profile]);

  const { data: myLeaves, isLoading: leavesLoading } = useCollection<LeaveRequest>(leavesQuery);

  async function onSubmit(data: z.infer<typeof leaveRequestSchema>) {
    if (!db || !profile) return;

    const { leaveType, dateRange, reason } = data;
    const { from, to } = dateRange;
    const endDate = to || from;
    
    const days = differenceInCalendarDays(endDate, from) + 1;

    try {
      const docRef = await addDoc(collection(db, 'hrLeaves'), {
        userId: profile.uid,
        userName: profile.displayName,
        leaveType,
        startDate: format(from, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        days,
        reason,
        status: 'SUBMITTED',
        year: getYear(from),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // The id is on the docRef, but we'll let the listener update the state.
      toast({ title: 'Leave request submitted successfully.' });
      form.reset();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Submission Failed', description: error.message });
    }
  }
  
  async function handleCancel(leaveId: string) {
    if (!db) return;
    setCancellingId(leaveId);
    try {
      await updateDoc(doc(db, 'hrLeaves', leaveId), {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });
      toast({ title: "Leave request cancelled." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Cancellation Failed', description: error.message });
    } finally {
      setCancellingId(null);
    }
  }
  
  const getStatusVariant = (status: LeaveStatus) => {
    switch (status) {
      case 'SUBMITTED': return 'secondary';
      case 'APPROVED': return 'default';
      case 'REJECTED': return 'destructive';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  }

  return (
    <>
      <PageHeader title="ใบลาของฉัน" description="ยื่นใบลาและดูประวัติการลาของคุณ" />
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>ยื่นใบลา</CardTitle>
              <CardDescription>กรอกข้อมูลด้านล่างเพื่อส่งใบลา</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="leaveType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ประเภทการลา</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="เลือกประเภทการลา" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {LEAVE_TYPES.map(type => (
                              <SelectItem key={type} value={type}>{type.charAt(0) + type.slice(1).toLowerCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateRange"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>วันที่ลา</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value?.from && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.from ? (
                                  field.value.to ? (
                                    <>
                                      {format(field.value.from, "LLL dd, y")} -{" "}
                                      {format(field.value.to, "LLL dd, y")}
                                    </>
                                  ) : (
                                    format(field.value.from, "LLL dd, y")
                                  )
                                ) : (
                                  <span>เลือกวันที่</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              initialFocus
                              mode="range"
                              defaultMonth={field.value?.from}
                              selected={field.value}
                              onSelect={field.onChange}
                              numberOfMonths={1}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>เหตุผล</FormLabel>
                        <FormControl>
                          <Textarea placeholder="ระบุเหตุผลการลา..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4"/>}
                    ส่งใบลา
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>ประวัติการลา</CardTitle>
                    <CardDescription>รายการใบลาของคุณทั้งหมด</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>วันที่</TableHead>
                                <TableHead>ประเภท</TableHead>
                                <TableHead>จำนวนวัน</TableHead>
                                <TableHead>สถานะ</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {leavesLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ) : myLeaves && myLeaves.length > 0 ? (
                                myLeaves.map((leave) => (
                                    <TableRow key={leave.id}>
                                        <TableCell className="font-medium">
                                          {format(new Date(leave.startDate), 'dd/MM/yy')} - {format(new Date(leave.endDate), 'dd/MM/yy')}
                                        </TableCell>
                                        <TableCell>{leave.leaveType}</TableCell>
                                        <TableCell>{leave.days}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(leave.status)}>{leave.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                        {leave.status === 'SUBMITTED' && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" disabled={!!cancellingId}>
                                                        {cancellingId === leave.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure you want to cancel?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will cancel your leave request from {format(new Date(leave.startDate), 'PPP')} to {format(new Date(leave.endDate), 'PPP')}. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Close</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleCancel(leave.id)} className="bg-destructive hover:bg-destructive/90">
                                                        Confirm Cancel
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        ยังไม่มีประวัติการลา
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
    </>
  );
}
