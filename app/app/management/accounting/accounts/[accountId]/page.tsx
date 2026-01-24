"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingAccount } from "@/lib/types";

const accountSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อบัญชี"),
  type: z.enum(["CASH", "BANK"], { required_error: "กรุณาเลือกประเภทบัญชี" }),
  bankName: z.string().optional(),
  accountNo: z.string().optional(),
  isActive: z.boolean().default(true),
}).refine(data => data.type !== 'BANK' || (data.bankName && data.bankName.length > 0 && data.accountNo && data.accountNo.length > 0), {
  message: "กรุณากรอกชื่อธนาคารและเลขบัญชี",
  path: ["bankName"], 
});

type AccountFormData = z.infer<typeof accountSchema>;

export default function EditAccountPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.accountId as string;
  const { db } = useFirebase();
  const { toast } = useToast();

  const accountDocRef = useMemo(() => {
    if (!db || !accountId) return null;
    return doc(db, "accountingAccounts", accountId);
  }, [db, accountId]);

  const { data: account, isLoading, error } = useDoc<AccountingAccount>(accountDocRef);

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      type: "CASH",
      bankName: "",
      accountNo: "",
      isActive: true,
    }
  });

  useEffect(() => {
    if (account) {
      form.reset({
        name: account.name,
        type: account.type,
        bankName: account.bankName || "",
        accountNo: account.accountNo || "",
        isActive: account.isActive,
      });
    }
  }, [account, form]);

  const accountType = form.watch("type");

  const onSubmit = async (values: AccountFormData) => {
    if (!db || !accountDocRef) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
        return;
    }
    try {
      await updateDoc(accountDocRef, {
        ...values,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      router.push("/app/management/accounting/accounts");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  if (error) {
    return (
        <>
            <PageHeader title="เกิดข้อผิดพลาด" description="โหลดข้อมูลบัญชีไม่สำเร็จ" />
            <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> กลับ</Button>
        </>
    )
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="กำลังโหลด..." description="กรุณารอสักครู่" />
        <Card><CardContent className="pt-6"><Skeleton className="h-96" /></CardContent></Card>
      </>
    );
  }
  
  if (!account) {
     return <PageHeader title="ไม่พบบัญชี" description="ไม่พบข้อมูลบัญชีที่ต้องการแก้ไข" />
  }

  return (
    <>
      <PageHeader title="แก้ไขบัญชี" description={`กำลังแก้ไขบัญชี: ${account.name}`} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          <Card>
            <CardContent className="pt-6 space-y-4">
               <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ชื่อบัญชี</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ประเภทบัญชี</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="เลือกประเภท..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">เงินสด</SelectItem>
                        <SelectItem value="BANK">ธนาคาร</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {accountType === 'BANK' && (
                <div className="space-y-4 pt-4 border-t">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ชื่อธนาคาร</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>เลขที่บัญชี</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
               <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>สถานะใช้งาน</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
            </CardContent>
          </Card>
          <div className="flex gap-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              บันทึกการแก้ไข
            </Button>
             <Button type="button" variant="outline" asChild>
              <Link href="/app/management/accounting/accounts"><ArrowLeft className="mr-2 h-4 w-4" /> ยกเลิก</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
