
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { PayrollBatch, HRSettings } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type SsoSettings = NonNullable<HRSettings['sso']>;
type SsoDecision = NonNullable<PayrollBatch['ssoDecision']>;

interface SsoDecisionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (decision: SsoDecision) => void;
  batchDecision: SsoDecision;
  currentSettings: SsoSettings;
}

const customDecisionSchema = z.object({
  employeePercent: z.coerce.number().min(0).max(100),
  monthlyMinBase: z.coerce.number().min(0),
  monthlyCap: z.coerce.number().min(0),
});

const decisionSchema = z.object({
  choice: z.enum(["current", "previous", "custom"]),
  custom: customDecisionSchema.optional(),
}).refine(data => data.choice !== 'custom' || !!data.custom, {
    message: "Custom values are required when 'custom' is selected.",
    path: ["custom"],
});

export function SsoDecisionDialog({ isOpen, onClose, onConfirm, batchDecision, currentSettings }: SsoDecisionDialogProps) {
  const form = useForm<z.infer<typeof decisionSchema>>({
    resolver: zodResolver(decisionSchema),
    defaultValues: {
      choice: "previous",
      custom: { ...currentSettings },
    },
  });

  const choice = form.watch("choice");

  const handleSubmit = (data: z.infer<typeof decisionSchema>) => {
    let finalDecision: SsoDecision;

    if (data.choice === "current") {
      finalDecision = { ...currentSettings, source: 'HR_OVERRIDE' } as SsoDecision;
    } else if (data.choice === "custom" && data.custom) {
      finalDecision = { ...data.custom, source: 'HR_OVERRIDE' } as SsoDecision;
    } else { // 'previous'
      finalDecision = { ...batchDecision }; // No change needed to source etc.
    }
    onConfirm(finalDecision);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            ตรวจพบการเปลี่ยนแปลงการตั้งค่าประกันสังคม
          </DialogTitle>
          <DialogDescription>
            การตั้งค่าประกันสังคมมีการเปลี่ยนแปลงหลังจากงวดที่ 1 ได้ถูกประมวลผลไปแล้ว กรุณาเลือกวิธีคำนวณสำหรับเดือนนี้
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
            <Card>
                <CardContent className="pt-6">
                    <h3 className="font-semibold mb-2">ค่าที่ล็อกไว้ (งวดที่ 1)</h3>
                    <p className="text-sm">Rate: {batchDecision?.employeePercent}%</p>
                    <p className="text-sm">Min Base: {batchDecision?.monthlyMinBase?.toLocaleString()}</p>
                    <p className="text-sm">Cap: {batchDecision?.monthlyCap?.toLocaleString()}</p>
                </CardContent>
            </Card>
             <Card>
                <CardContent className="pt-6">
                    <h3 className="font-semibold mb-2">ค่าปัจจุบัน (จาก Settings)</h3>
                    <p className="text-sm">Rate: {currentSettings.employeePercent}%</p>
                    <p className="text-sm">Min Base: {currentSettings.monthlyMinBase?.toLocaleString()}</p>
                    <p className="text-sm">Cap: {currentSettings.monthlyCap?.toLocaleString()}</p>
                </CardContent>
            </Card>
        </div>
        <Form {...form}>
            <form id="sso-decision-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="choice"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>สำหรับเดือนนี้ คุณต้องการ...</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl><RadioGroupItem value="previous" /></FormControl>
                                    <FormLabel className="font-normal">ใช้ค่าที่ล็อกไว้เดิมสำหรับทั้งเดือน (แนะนำ)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl><RadioGroupItem value="current" /></FormControl>
                                    <FormLabel className="font-normal">ใช้ค่าปัจจุบันสำหรับทั้งเดือน (ระบบจะปรับปรุงยอดหักในงวดที่ 2)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl><RadioGroupItem value="custom" /></FormControl>
                                    <FormLabel className="font-normal">กำหนดค่าสำหรับเดือนนี้เอง</FormLabel>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />

                {choice === 'custom' && (
                     <Card className="p-4 bg-muted/50">
                        <div className="grid grid-cols-3 gap-4">
                            <FormField control={form.control} name="custom.employeePercent" render={({ field }) => (<FormItem><FormLabel>Rate (%)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
                            <FormField control={form.control} name="custom.monthlyMinBase" render={({ field }) => (<FormItem><FormLabel>Min Base</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
                            <FormField control={form.control} name="custom.monthlyCap" render={({ field }) => (<FormItem><FormLabel>Cap</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl></FormItem>)} />
                        </div>
                    </Card>
                )}
            </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form="sso-decision-form">
            ยืนยันและคำนวณใหม่
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
