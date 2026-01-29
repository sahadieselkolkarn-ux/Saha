"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

export default function OfficeJobManagementByStatusPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ตามสถานะ" description="แสดงงานทั้งหมดที่ยังไม่ปิด แยกตามสถานะปัจจุบัน" />
      <Tabs defaultValue="quotation">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="quotation">งานเสนอราคา</TabsTrigger>
          <TabsTrigger value="waiting-approve">รอลูกค้าอนุมัติ</TabsTrigger>
          <TabsTrigger value="pending-parts">กำลังจัดอะไหล่</TabsTrigger>
          <TabsTrigger value="done">งานเสร็จรอทำบิล</TabsTrigger>
          <TabsTrigger value="pickup">รอลูกค้ารับสินค้า</TabsTrigger>
        </TabsList>
        <Card className="mt-4">
            <CardContent className="p-0">
                <TabsContent value="quotation" className="mt-0">
                    <JobList 
                        status='WAITING_QUOTATION'
                        emptyTitle="ไม่มีงานที่รอเสนอราคา"
                        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_QUOTATION ในขณะนี้"
                    />
                </TabsContent>
                <TabsContent value="waiting-approve" className="mt-0">
                    <JobList 
                        status="WAITING_APPROVE"
                        actionPreset="waitingApprove"
                        emptyTitle="ไม่มีงานที่รอลูกค้าอนุมัติ"
                        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_APPROVE ในขณะนี้"
                    />
                </TabsContent>
                 <TabsContent value="pending-parts" className="mt-0">
                    <JobList 
                        status="PENDING_PARTS"
                        actionPreset="pendingPartsReady"
                        emptyTitle="ไม่มีงานที่รอจัดอะไหล่"
                        emptyDescription="ไม่มีงานที่อยู่ในสถานะ PENDING_PARTS ในขณะนี้"
                    />
                </TabsContent>
                 <TabsContent value="done" className="mt-0">
                    <JobList 
                        status="DONE"
                        emptyTitle="ไม่มีงานที่เสร็จแล้ว"
                        emptyDescription="ยังไม่มีงานที่อยู่ในสถานะ 'DONE' รอทำบิล"
                    />
                </TabsContent>
                 <TabsContent value="pickup" className="mt-0">
                    <JobList 
                        status="WAITING_CUSTOMER_PICKUP"
                        emptyTitle="ไม่มีงานที่รอลูกค้ารับของ"
                        emptyDescription="ไม่มีงานที่อยู่ในสถานะ WAITING_CUSTOMER_PICKUP"
                    />
                </TabsContent>
            </CardContent>
        </Card>
      </Tabs>
    </>
  );
}
