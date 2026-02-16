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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Clock } from "lucide-react";

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
  notes: z.string().min(1, "กรุณาระบุเหตุผลในการปรับปรุงข้อมูล"),
  forgiveLate: z.boolean().default(false),
}).refine(data => data.inTime || data.outTime || data.forgiveLate, {
  message: "กรุณากรอกเวลาเข้า/ออก หรือเลือกยกเว้นการสายอย่างน้อยหนึ่งรายการ",
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

  const parseTimeString = (str: string) => {
    if (!str) return null;
    // Support both 08:00 and 08.00
    const normalized = str.trim().replace('.', ':');
    const parts = normalized.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
        return null;
    }
    return { hours, minutes };
  };

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
            const time = parseTimeString(inTime);
            if (!time) throw new Error("รูปแบบเวลาเข้าไม่ถูกต้อง (ใช้ 00.00 - 23.59)");
            const inDate = set(dayInfo.date, { hours: time.hours, minutes: time.minutes, seconds: 0 });
            adjustedIn = Timestamp.fromDate(inDate);
        }
        if (outTime) {
            const time = parseTimeString(outTime);
            if (!time) throw new Error("รูปแบบเวลาออกไม่ถูกต้อง (ใช้ 00.00 - 23.59)");
            const outDate = set(dayInfo.date, { hours: time.hours, minutes: time.minutes, seconds: 0 });
            adjustedOut = Timestamp.fromDate(outDate);
        }
    } catch(e: any) {
        toast({ variant: 'destructive', title: 'รูปแบบเวลาไม่ถูกต้อง', description: e.message });
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
            adjustedIn: adjustedIn || null,
            adjustedOut: adjustedOut || null,
            notes,
            updatedBy: adminProfile.displayName,
            updatedById: adminProfile.uid,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        
        toast({ title: "บันทึกการปรับปรุงเวลาสำเร็จ", description: `อัปเดตข้อมูลของ ${user.displayName} วันที่ ${format(dayInfo.date, 'dd MMM')} เรียบร้อยแล้วค่ะ` });
        if (onSaved) onSaved();
        onOpenChange(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: "บันทึกไม่สำเร็จ", description: error.message });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>ปรับปรุงเวลาทำงาน (24 ชม.)</DialogTitle>
          <DialogDescription>
            แก้ไขเวลาของ <span className="font-semibold text-primary">{user.displayName}</span> ประจำวันที่ <span className="font-semibold">{format(dayInfo.date, "PPP")}</span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="adjustment-form" className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="inTime" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-2 text-green-600"><Clock className="h-3 w-3" /> เวลาเข้างาน (IN)</FormLabel>
                            <FormControl><Input placeholder="เช่น 08.00" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="outTime" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-2 text-destructive"><Clock className="h-3 w-3" /> เวลาออกงาน (OUT)</FormLabel>
                            <FormControl><Input placeholder="เช่น 17.30" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <p className="text-[10px] text-muted-foreground italic">* กรอกแบบ 24 ชม. ได้เลยค่ะ เช่น 19.00 คือ หนึ่งทุ่ม</p>
                
                 <FormField control={form.control} name="forgiveLate" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 bg-muted/20">
                        <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-bold">ยกเว้นการมาสาย (Forgive Lateness)</FormLabel>
                            <FormMessage />
                        </div>
                    </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                        <FormLabel>เหตุผลในการปรับปรุง</FormLabel>
                        <FormControl><Textarea placeholder="เช่น ลืมสแกนออก, ไฟดับ, ไปทำงานข้างนอก..." {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button type="submit" form="adjustment-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึกการแก้ไข
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
