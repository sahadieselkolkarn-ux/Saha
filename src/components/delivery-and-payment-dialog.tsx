
"use client";

import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";

import { useAuth } from "@/context/auth-context";
import type { Document as DocumentType, AccountingAccount } from "@/lib/types";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";

// --- Helper Functions & Schemas ---

const formatCurrency = (value: number | null | undefined) => {
  return (value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const paymentLineSchema = z.object({
  paymentMethod: z.enum(["CASH", "TRANSFER"], {
    required_error: "กรุณาเลือกช่องทาง",
  }),
  accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
  amountReceived: z.coerce.number().min(0.01, "ยอดเงินต้องมากกว่า 0"),
  withholdingEnabled: z.boolean().default(false),
  withholdingAmount: z.coerce.number().min(0).optional(),
});

export const deliveryAndPaymentSchema = z.object({
  delivery: z.object({
    deliveredDate: z.string().min(1, "กรุณาเลือกวันที่ส่งมอบ"),
    deliveredByName: z.string().optional(),
    receivedByName: z.string().optional(),
    note: z.string().optional(),
  }),
  paymentLines: z.array(paymentLineSchema),
  createAR: z.boolean().default(false),
  arDueDate: z.string().optional().nullable(),
});

export type DeliveryAndPaymentData = z.infer<typeof deliveryAndPaymentSchema>;

// --- Component Props ---

interface DeliveryAndPaymentDialogProps {
  document: DocumentType;
  accounts: AccountingAccount[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: DeliveryAndPaymentData) => Promise<void>;
  isLoading: boolean;
}

// --- Main Component ---

export function DeliveryAndPaymentDialog({
  document,
  accounts,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: DeliveryAndPaymentDialogProps) {
  const { profile } = useAuth();

  const form = useForm<DeliveryAndPaymentData>({
    resolver: zodResolver(deliveryAndPaymentSchema),
    defaultValues: {
      delivery: {
        deliveredDate: format(new Date(), "yyyy-MM-dd"),
        deliveredByName: profile?.displayName || "",
        receivedByName: document.customerSnapshot?.name || "",
        note: "",
      },
      paymentLines: [
        {
          paymentMethod: "CASH",
          accountId: accounts.length > 0 ? accounts[0].id : "",
          amountReceived: document.grandTotal,
          withholdingEnabled: false,
          withholdingAmount: 0,
        },
      ],
      createAR: false,
      arDueDate: null,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "paymentLines",
  });

  const watchedPaymentLines = useWatch({
    control: form.control,
    name: "paymentLines",
  });
  
  const watchedCreateAR = form.watch("createAR");

  const summary = useMemo(() => {
    const paidThisDialog = watchedPaymentLines.reduce(
      (sum, line) => sum + (line.amountReceived || 0),
      0
    );
    const remaining = document.grandTotal - paidThisDialog;
    return { paidThisDialog, remaining };
  }, [watchedPaymentLines, document.grandTotal]);
  
  useEffect(() => {
    // If there's a remaining balance, automatically suggest creating an AR entry.
    form.setValue("createAR", summary.remaining > 0);
  }, [summary.remaining, form]);


  const handleSubmit = async (data: DeliveryAndPaymentData) => {
    await onConfirm(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>ส่งมอบงานและรับเงิน</DialogTitle>
          <DialogDescription>
            สำหรับเอกสาร: {document.docNo} ({document.customerSnapshot.name})
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="delivery-payment-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex-1 overflow-y-auto pr-2 -mr-6 pl-6"
          >
            <div className="space-y-6">
              {/* Delivery Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">1. ยืนยันการส่งมอบ</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="delivery.deliveredDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>วันที่ส่งมอบ/ลูกค้ารับของ</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="delivery.deliveredByName" render={({ field }) => (<FormItem><FormLabel>ผู้ส่งมอบ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="delivery.receivedByName" render={({ field }) => (<FormItem><FormLabel>ผู้รับ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                  </div>
                  <FormField control={form.control} name="delivery.note" render={({ field }) => (<FormItem><FormLabel>หมายเหตุการส่งมอบ</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                </CardContent>
              </Card>

              {/* Payment Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">2. บันทึกการรับเงิน</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {fields.map((field, index) => (
                    <Card key={field.id} className="bg-muted/50 p-4 relative">
                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name={`paymentLines.${index}.paymentMethod`} render={({ field }) => (<FormItem><FormLabel>ช่องทาง</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent></Select></FormItem>)} />
                        <FormField control={form.control} name={`paymentLines.${index}.accountId`} render={({ field }) => (<FormItem><FormLabel>เข้าบัญชี</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger></FormControl><SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      </div>
                      <div className="mt-4">
                        <FormField control={form.control} name={`paymentLines.${index}.amountReceived`} render={({ field }) => (<FormItem><FormLabel>ยอดเงินที่รับ (ก่อนหัก WHT)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      </div>
                       <div className="mt-4 space-y-2">
                        <FormField control={form.control} name={`paymentLines.${index}.withholdingEnabled`} render={({ field }) => (<FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">มีหัก ณ ที่จ่าย (Withholding Tax)</FormLabel></FormItem>)} />
                        {form.watch(`paymentLines.${index}.withholdingEnabled`) && (
                            <FormField control={form.control} name={`paymentLines.${index}.withholdingAmount`} render={({ field }) => (<FormItem><FormLabel>ยอดเงินที่ถูกหัก (WHT)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        )}
                      </div>
                    </Card>
                  ))}
                   <Button type="button" variant="outline" size="sm" onClick={() => append({ paymentMethod: 'CASH', accountId: accounts[0]?.id, amountReceived: 0, withholdingEnabled: false, withholdingAmount: 0 })}>
                    <PlusCircle className="mr-2" /> เพิ่มรายการรับเงิน
                  </Button>
                </CardContent>
              </Card>

              {/* Summary and AR Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">3. สรุปและยอดค้าง</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-md border p-4">
                    <div className="flex justify-between font-medium"><span>ยอดรวมตามเอกสาร:</span><span>{formatCurrency(document.grandTotal)}</span></div>
                    <div className="flex justify-between"><span>ยอดรับชำระในครั้งนี้:</span><span>{formatCurrency(summary.paidThisDialog)}</span></div>
                    <Separator/>
                    <div className={cn("flex justify-between text-lg font-bold", summary.remaining > 0 ? "text-destructive" : "text-green-600")}>
                      <span>ยอดคงเหลือ:</span>
                      <span>{formatCurrency(summary.remaining)}</span>
                    </div>
                  </div>
                  
                  {summary.remaining > 0 && (
                     <div className="space-y-2 rounded-md border p-4">
                        <FormField
                            control={form.control}
                            name="createAR"
                            render={({ field }) => (
                                <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                <FormLabel className="font-normal">บันทึกยอดคงเหลือเป็นลูกหนี้ (ค้างรับ)</FormLabel>
                                </FormItem>
                            )}
                        />
                        {watchedCreateAR && (
                             <FormField
                                control={form.control}
                                name="arDueDate"
                                render={({ field }) => (
                                    <FormItem className="mt-2">
                                    <FormLabel>วันครบกำหนดชำระ (ถ้ามี)</FormLabel>
                                    <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                                    </FormItem>
                                )}
                            />
                        )}
                     </div>
                  )}

                </CardContent>
              </Card>
            </div>
          </form>
        </Form>
        
        <DialogFooter className="border-t pt-6 -mx-6 px-6 pb-6 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            ยกเลิก
          </Button>
          <Button type="submit" form="delivery-payment-form" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 animate-spin" />}
            ยืนยันการส่งมอบและรับเงิน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
