"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ManagementAccountingPage() {
    return (
        <>
            <PageHeader title="บริหารงานบัญชี" description="จัดการข้อมูลการเงินทั้งหมด" />
            <Tabs defaultValue="revenue" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                    <TabsTrigger value="revenue">รายรับ (เงินเข้า)</TabsTrigger>
                    <TabsTrigger value="expenses">รายจ่าย (เงินออก)</TabsTrigger>
                    <TabsTrigger value="debtors">ลูกหนี้</TabsTrigger>
                    <TabsTrigger value="creditors">เจ้าหนี้</TabsTrigger>
                    <TabsTrigger value="accounts">บัญชีเงินสด/ธนาคาร</TabsTrigger>
                </TabsList>
                <TabsContent value="revenue">
                    <Card>
                        <CardHeader>
                            <CardTitle>รายรับ (เงินเข้า)</CardTitle>
                            <CardDescription>จัดการและดูข้อมูลรายรับทั้งหมด</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="expenses">
                     <Card>
                        <CardHeader>
                            <CardTitle>รายจ่าย (เงินออก)</CardTitle>
                            <CardDescription>จัดการและดูข้อมูลรายจ่ายทั้งหมด</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="debtors">
                     <Card>
                        <CardHeader>
                            <CardTitle>ลูกหนี้</CardTitle>
                            <CardDescription>จัดการและติดตามข้อมูลลูกหนี้</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="creditors">
                     <Card>
                        <CardHeader>
                            <CardTitle>เจ้าหนี้</CardTitle>
                            <CardDescription>จัดการและติดตามข้อมูลเจ้าหนี้</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="accounts">
                     <Card>
                        <CardHeader>
                            <CardTitle>บัญชีเงินสด/ธนาคาร</CardTitle>
                            <CardDescription>จัดการและดูข้อมูลบัญชีการเงิน</CardDescription>
                        </CardHeader>
                        <CardContent><p>Coming soon.</p></CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </>
    );
}
