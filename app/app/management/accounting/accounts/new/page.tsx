"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const accountSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อบัญชี"),
  type: z.enum(["CASH", "BANK"], { required_error: "กรุณาเลือกประเภทบัญชี" }),
  bankName: z.string().optional(),
  accountNo: z.string().optional(),
  openingBalance: z.coerce.number().optional(),
  openingBalanceDate: z.string().optional(),
}).refine(data => data.type !== 'BANK' || (data.bankName && data.accountNo), {
  message: "กรุณากรอกชื่อธนาคารและเลขบัญชี",
  path: ["bankName"],
});

type AccountFormData = z.infer<typeof accountSchema>;

export default function NewAccountPage() {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const isUserAdmin = profile?.role === 'ADMIN';

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      bankName: "",
      accountNo: "",
      openingBalance: 0,
      openingBalanceDate: new Date().toISOString().split("T")[0],
    },
  });

  const accountType = form.watch("type");

  const onSubmit = async (values: AccountFormData) => {
    if (!db || !profile) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ยังไม่พร้อมเชื่อมต่อฐานข้อมูล" });
      return;
    }

    try {
      const dataToAdd: any = {
        name: values.name,
        type: values.type,
        bankName: values.bankName || null,
        accountNo: values.accountNo || null,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      if (isUserAdmin && (values.openingBalance !== undefined && values.openingBalance > 0)) {
          dataToAdd.openingBalance = values.openingBalance;
          dataToAdd.openingBalanceDate = values.openingBalanceDate || new Date().toISOString().split("T")[0];
          dataToAdd.openingBalanceSetByUid = profile.uid;
          dataToAdd.openingBalanceSetAt = serverTimestamp();
      }

      await addDoc(collection(db, "accountingAccounts"), dataToAdd);
      toast({ title: "เพิ่มบัญชีสำเร็จ" });
      router.push("/app/management/accounting/accounts");
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    }
  };

  return (
    <>
      <PageHeader title="เพิ่มบัญชีใหม่" description="สร้างบัญชีเงินสดหรือบัญชีธนาคารสำหรับบันทึกรายการ" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader><CardTitle>ข้อมูลบัญชี</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ชื่อบัญชี</FormLabel>
                    <FormControl><Input placeholder="เช่น เงินสดหน้าร้าน, SCB-1234" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="เช่น กสิกรไทย, ไทยพาณิชย์" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="123-4-56789-0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          
          {isUserAdmin && (
            <Card>
                <CardHeader>
                    <CardTitle>ยอดยกมา</CardTitle>
                    <CardDescription>ตั้งค่าได้เฉพาะแอดมินเท่านั้น</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <FormField
                        control={form.control}
                        name="openingBalance"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>ยอดยกมา</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="openingBalanceDate"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>วันที่ยอดยกมา</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </CardContent>
            </Card>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              บันทึกบัญชี
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
