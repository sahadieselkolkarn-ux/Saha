"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, set } from "date-fns";
import { Timestamp, doc, setDoc, serverTimestamp } from "firebase/firestore";

import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile, AttendanceAdjustment } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface AttendanceDailySummary {
  date: Date;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'NO_DATA' | 'NOT_STARTED' | 'ENDED' | 'SUSPENDED' | 'FUTURE';
  rawIn?: Date | null;
  rawOut?: Date | null;
  adjustment?: WithId<AttendanceAdjustment>;
}

interface AttendanceAdjustmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dayInfo: AttendanceDailySummary;
  user: WithId<UserProfile>;
  onSaved?: () => void;
}

const adjustmentSchema = z.object({
  inTime: z.string().optional(),
  outTime: z.string().optional(),
  notes: z.string().min(1, "A reason for the adjustment is required."),
  forgiveLate: z.boolean().default(false),
}).refine(data => data.inTime || data.outTime || data.forgiveLate, {
  message: "At least one adjustment (In/Out time or Forgive Late) must be made.",
  path: ["notes"],
});

export function AttendanceAdjustmentDialog({ isOpen, onOpenChange, dayInfo, user, onSaved }: AttendanceAdjustmentDialogProps) {
  const { db } = useFirebase();
  const { profile: adminProfile } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      inTime: dayInfo.rawIn ? format(dayInfo.rawIn, "HH:mm") : "",
      outTime: dayInfo.rawOut ? format(dayInfo.rawOut, "HH:mm") : "",
      notes: dayInfo.adjustment?.notes || "",
      forgiveLate: dayInfo.adjustment?.type === 'FORGIVE_LATE' || false,
    }
  });
  
  useEffect(() => {
    form.reset({
      inTime: dayInfo.rawIn ? format(dayInfo.rawIn, "HH:mm") : "",
      outTime: dayInfo.rawOut ? format(dayInfo.rawOut, "HH:mm") : "",
      notes: dayInfo.adjustment?.notes || "",
      forgiveLate: dayInfo.adjustment?.type === 'FORGIVE_LATE' || false,
    });
  }, [dayInfo, form]);

  async function onSubmit(values: z.infer<typeof adjustmentSchema>) {
    if (!db || !adminProfile) return;

    const { inTime, outTime, notes, forgiveLate } = values;
    
    let type: 'ADD_RECORD' | 'FORGIVE_LATE' = 'ADD_RECORD';
    if (forgiveLate) {
        type = 'FORGIVE_LATE';
    }

    let adjustedIn: Timestamp | undefined = undefined;
    let adjustedOut: Timestamp | undefined = undefined;

    try {
        if (inTime) {
            const [hours, minutes] = inTime.split(':').map(Number);
            const inDate = set(dayInfo.date, { hours, minutes, seconds: 0 });
            adjustedIn = Timestamp.fromDate(inDate);
        }
        if (outTime) {
            const [hours, minutes] = outTime.split(':').map(Number);
            const outDate = set(dayInfo.date, { hours, minutes, seconds: 0 });
            adjustedOut = Timestamp.fromDate(outDate);
        }
    } catch(e) {
        toast({ variant: 'destructive', title: 'Invalid Time Format', description: 'Please use HH:mm format.'});
        return;
    }


    try {
        const dateStr = format(dayInfo.date, 'yyyy-MM-dd');
        const adjId = `${user.id}_${dateStr}`;
        const adjRef = doc(db, "hrAttendanceAdjustments", adjId);

        await setDoc(adjRef, {
            userId: user.id,
            date: dateStr,
            type,
            adjustedIn: adjustedIn,
            adjustedOut: adjustedOut,
            notes,
            updatedBy: adminProfile.displayName,
            updatedById: adminProfile.uid,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        toast({ title: "Adjustment Saved", description: `Attendance for ${user.displayName} on ${format(dayInfo.date, 'dd MMM')} has been updated.` });
        if (onSaved) onSaved();
        onOpenChange(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Save Failed", description: error.message });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adjust Attendance</DialogTitle>
          <DialogDescription>
            Editing for <span className="font-semibold">{user.displayName}</span> on <span className="font-semibold">{format(dayInfo.date, "PPP")}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="adjustment-form" className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="inTime" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Clock In Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="outTime" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Clock Out Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                 <FormField control={form.control} name="forgiveLate" render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Forgive Lateness</FormLabel>
                            <FormMessage />
                        </div>
                    </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Reason for Adjustment</FormLabel>
                        <FormControl><Textarea placeholder="e.g., Forgot to clock out, power outage..." {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="adjustment-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
