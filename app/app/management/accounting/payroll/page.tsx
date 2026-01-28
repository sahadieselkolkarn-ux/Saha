
"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DeprecatedPayrollPage() {
  return (
    <>
      <PageHeader title="การจ่ายเงินเดือน (บัญชี)" description="หน้านี้กำลังอยู่ในระหว่างการปรับปรุง" />
      <Card>
        <CardHeader>
          <CardTitle>เมนูนี้ถูกย้ายและกำลังรวมกับส่วนของ HR</CardTitle>
          <CardDescription>
            ฟังก์ชันการจ่ายเงินเดือนกำลังถูกย้ายไปรวมกับส่วนของ "แผนกบุคคล" เพื่อการจัดการที่ง่ายขึ้น
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">กรุณาไปที่เมนู "สร้างสลิปเงินเดือน" ในส่วนของแผนกบุคคลเพื่อใช้งานฟังก์ชันล่าสุด</p>
          <Button asChild>
            <Link href="/app/management/hr/payroll">
              ไปที่หน้าสร้างสลิปเงินเดือน
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
