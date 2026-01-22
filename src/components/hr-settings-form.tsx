
"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, setDoc } from "firebase/firestore";

import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import type { HRSettings } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const leaveTypePolicySchema = z.object({
  annualEntitlement: z.coerce.number().min(0).optional(),
  overLimitHandling: z.object({
    mode: z.enum(["DEDUCT_SALARY", "UNPAID", "DISALLOW"]).optional(),
    salaryDeductionBaseDays: z.coerce.number().min(1).optional(),
  }).optional(),
});

// Zod schema for validation
const hrSettingsSchema = z.object({
  workStart: z.string().optional(),
  workEnd: z.string().optional(),
  breakStart: z.string().optional(),
  breakEnd: z.string().optional(),
  graceMinutes: z.coerce.number().min(0).optional(),
  absentCutoffTime: z.string().optional(),
  minSecondsBetweenScans: z.coerce.number().min(0).optional(),
  payroll: z.object({
    payday1: z.coerce.number().min(1).max(31).optional(),
    period1Start: z.coerce.number().min(1).max(31).optional(),
    period1End: z.coerce.number().min(1).max(31).optional(),
    payday2: z.string().optional(),
    period2Start: z.coerce.number().min(1).max(31).optional(),
    period2End: z.string().optional(),
  }).optional(),
  sso: z.object({
    employeePercent: z.coerce.number().min(0).max(100).optional(),
    employerPercent: z.coerce.number().min(0).max(100).optional(),
    monthlyCap: z.coerce.number().min(0).optional(),
  }).optional(),
  withholding: z.object({
    enabled: z.boolean().default(false),
    defaultPercent: z.coerce.number().min(0).max(100).optional(),
    note: z.string().optional(),
  }).optional(),
  leavePolicy: z.object({
    calculationPeriod: z.literal("CALENDAR_YEAR").optional(),
    leaveTypes: z.object({
      SICK: leaveTypePolicySchema.optional(),
      BUSINESS: leaveTypePolicySchema.optional(),
      VACATION: leaveTypePolicySchema.optional(),
    }).optional()
  }).optional(),
});

const LeavePolicyFields = ({ type, form }: { type: 'SICK' | 'BUSINESS' | 'VACATION', form: any }) => {
  const overLimitMode = form.watch(`leavePolicy.leaveTypes.${type}.overLimitHandling.mode`);
  const typeLabel = type.charAt(0) + type.slice(1).toLowerCase();

  return (
    <div>
      <h4 className="font-medium mb-2">{typeLabel} Leave</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
        <FormField
          control={form.control}
          name={`leavePolicy.leaveTypes.${type}.annualEntitlement`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Annual Entitlement</FormLabel>
              <FormControl><Input type="number" placeholder="e.g. 30" {...field} /></FormControl>
              <FormDescription>Days per year</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`leavePolicy.leaveTypes.${type}.overLimitHandling.mode`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Over-limit Handling</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="DEDUCT_SALARY">Deduct from Salary</SelectItem>
                  <SelectItem value="UNPAID">Unpaid Leave</SelectItem>
                  <SelectItem value="DISALLOW">Disallow</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        {overLimitMode === 'DEDUCT_SALARY' && (
          <FormField
            control={form.control}
            name={`leavePolicy.leaveTypes.${type}.overLimitHandling.salaryDeductionBaseDays`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deduction Base Days</FormLabel>
                <FormControl><Input type="number" placeholder="e.g. 26" {...field} /></FormControl>
                <FormDescription>Salary will be divided by this number.</FormDescription>
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );
};


export function HRSettingsForm() {
  const { db } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemo(() => {
    if (!db) return null;
    return doc(db, "settings", "hr");
  }, [db]);

  const { data: settings, isLoading } = useDoc<HRSettings>(settingsDocRef);

  const form = useForm<z.infer<typeof hrSettingsSchema>>({
    resolver: zodResolver(hrSettingsSchema),
    defaultValues: {
      workStart: "",
      workEnd: "",
      breakStart: "",
      breakEnd: "",
      graceMinutes: 0,
      absentCutoffTime: "",
      minSecondsBetweenScans: 60,
      payroll: {
        payday1: 15,
        period1Start: 1,
        period1End: 15,
        payday2: "EOM",
        period2Start: 16,
        period2End: "EOM",
      },
      sso: {
        employeePercent: 0,
        employerPercent: 0,
        monthlyCap: 0,
      },
      withholding: {
        enabled: false,
        defaultPercent: 0,
        note: "",
      },
      leavePolicy: {
        calculationPeriod: 'CALENDAR_YEAR',
        leaveTypes: {
          SICK: { annualEntitlement: 30, overLimitHandling: { mode: 'DEDUCT_SALARY', salaryDeductionBaseDays: 26 } },
          BUSINESS: { annualEntitlement: 7, overLimitHandling: { mode: 'DEDUCT_SALARY', salaryDeductionBaseDays: 26 } },
          VACATION: { annualEntitlement: 6, overLimitHandling: { mode: 'DISALLOW' } },
        }
      }
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        workStart: settings.workStart || "",
        workEnd: settings.workEnd || "",
        breakStart: settings.breakStart || "",
        breakEnd: settings.breakEnd || "",
        graceMinutes: settings.graceMinutes ?? 0,
        absentCutoffTime: settings.absentCutoffTime || "",
        minSecondsBetweenScans: settings.minSecondsBetweenScans ?? 60,
        payroll: {
          payday1: settings.payroll?.payday1 ?? 15,
          period1Start: settings.payroll?.period1Start ?? 1,
          period1End: settings.payroll?.period1End ?? 15,
          payday2: settings.payroll?.payday2 || "EOM",
          period2Start: settings.payroll?.period2Start ?? 16,
          period2End: settings.payroll?.period2End || "EOM",
        },
        sso: {
          employeePercent: settings.sso?.employeePercent ?? 0,
          employerPercent: settings.sso?.employerPercent ?? 0,
          monthlyCap: settings.sso?.monthlyCap ?? 0,
        },
        withholding: {
          enabled: settings.withholding?.enabled || false,
          defaultPercent: settings.withholding?.defaultPercent ?? 0,
          note: settings.withholding?.note || "",
        },
        leavePolicy: {
          calculationPeriod: 'CALENDAR_YEAR',
          leaveTypes: {
            SICK: settings.leavePolicy?.leaveTypes?.SICK,
            BUSINESS: settings.leavePolicy?.leaveTypes?.BUSINESS,
            VACATION: settings.leavePolicy?.leaveTypes?.VACATION,
          }
        }
      });
    }
  }, [settings, form]);

  const onSubmit = async (values: z.infer<typeof hrSettingsSchema>) => {
    if (!settingsDocRef) return;
    try {
      // Ensure the calculationPeriod is always set
      const finalValues = {
        ...values,
        leavePolicy: {
          ...values.leavePolicy,
          calculationPeriod: 'CALENDAR_YEAR'
        }
      };

      await setDoc(settingsDocRef, finalValues, { merge: true });
      toast({
        title: "Settings Saved",
        description: "HR settings have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error Saving Settings",
        description: error.message,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Work & Break Times</CardTitle>
            <CardDescription>
              ตั้งค่าเวลาทำงานและเวลาพักมาตรฐาน
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <FormField control={form.control} name="workStart" render={({ field }) => (<FormItem><FormLabel>Work Start</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="workEnd" render={({ field }) => (<FormItem><FormLabel>Work End</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="breakStart" render={({ field }) => (<FormItem><FormLabel>Break Start</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="breakEnd" render={({ field }) => (<FormItem><FormLabel>Break End</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl></FormItem>)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Rules</CardTitle>
            <CardDescription>
              กฎการมาสาย, ขาด, และการป้องกันการสแกนซ้ำ
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField control={form.control} name="graceMinutes" render={({ field }) => (<FormItem><FormLabel>Grace Period (minutes)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl><FormDescription>นาทีที่อนุญาตให้สายได้</FormDescription></FormItem>)} />
            <FormField control={form.control} name="absentCutoffTime" render={({ field }) => (<FormItem><FormLabel>Absent Cutoff Time</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl><FormDescription>หลังเวลานี้ถือว่าขาด</FormDescription></FormItem>)} />
            <FormField control={form.control} name="minSecondsBetweenScans" render={({ field }) => (<FormItem><FormLabel>Scan Cooldown (seconds)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl><FormDescription>กันการสแกนซ้ำ</FormDescription></FormItem>)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leave Policy</CardTitle>
            <CardDescription>
              กำหนดสิทธิ์การลาประเภทต่างๆ คำนวณตามปีปฏิทิน (1 ม.ค. - 31 ธ.ค.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LeavePolicyFields type="SICK" form={form} />
            <LeavePolicyFields type="BUSINESS" form={form} />
            <LeavePolicyFields type="VACATION" form={form} />
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>Payroll Cycles</CardTitle>
            <CardDescription>
              กำหนดรอบการจ่ายเงินเดือน (ปัจจุบันรองรับ 2 รอบ)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">Period 1</h4>
              <div className="grid grid-cols-3 gap-4 p-4 border rounded-md">
                <FormField control={form.control} name="payroll.period1Start" render={({ field }) => (<FormItem><FormLabel>Start Day</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="payroll.period1End" render={({ field }) => (<FormItem><FormLabel>End Day</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="payroll.payday1" render={({ field }) => (<FormItem><FormLabel>Pay Day</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Period 2</h4>
              <div className="grid grid-cols-3 gap-4 p-4 border rounded-md">
                <FormField control={form.control} name="payroll.period2Start" render={({ field }) => (<FormItem><FormLabel>Start Day</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="payroll.period2End" render={({ field }) => (<FormItem><FormLabel>End Day</FormLabel><FormControl><Input placeholder="EOM" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="payroll.payday2" render={({ field }) => (<FormItem><FormLabel>Pay Day</FormLabel><FormControl><Input placeholder="EOM" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social Security (SSO)</CardTitle>
            <CardDescription>
              การตั้งค่าการคำนวณประกันสังคม
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <FormField control={form.control} name="sso.employeePercent" render={({ field }) => (<FormItem><FormLabel>Employee %</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
             <FormField control={form.control} name="sso.employerPercent" render={({ field }) => (<FormItem><FormLabel>Employer %</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
             <FormField control={form.control} name="sso.monthlyCap" render={({ field }) => (<FormItem><FormLabel>Monthly Cap</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Withholding Tax</CardTitle>
            <CardDescription>
              การตั้งค่าภาษีหัก ณ ที่จ่าย
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <FormField control={form.control} name="withholding.enabled" render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="font-normal">Enable Withholding Tax</FormLabel>
                </FormItem>
            )} />
            <FormField control={form.control} name="withholding.defaultPercent" render={({ field }) => (<FormItem><FormLabel>Default Percent (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} disabled={!form.watch('withholding.enabled')} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="withholding.note" render={({ field }) => (<FormItem><FormLabel>Note</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
          </CardContent>
        </Card>
        
        <div className="flex justify-end sticky bottom-0 bg-background/80 backdrop-blur-sm py-4 -mb-8">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
              Save Settings
            </Button>
        </div>
      </form>
    </Form>
  );
}
