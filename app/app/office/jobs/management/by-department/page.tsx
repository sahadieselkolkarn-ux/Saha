"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

export default function OfficeJobManagementByDepartmentPage() {
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ตามแผนก" description="แสดงงานทั้งหมดที่ยังไม่ปิด แยกตามแผนกที่รับผิดชอบ" />
      <Tabs defaultValue="car-service">
        <TabsList>
          <TabsTrigger value="car-service">งานซ่อมหน้าร้าน</TabsTrigger>
          <TabsTrigger value="commonrail">แผนกคอมมอนเรล</TabsTrigger>
          <TabsTrigger value="mechanic">แผนกแมคคานิค</TabsTrigger>
          <TabsTrigger value="outsource">งานส่งออกร้านนอก</TabsTrigger>
        </TabsList>
        <Card className="mt-4">
            <CardContent className="p-0">
                <TabsContent value="car-service" className="mt-0">
                    <JobList 
                        department="CAR_SERVICE" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="commonrail" className="mt-0">
                    <JobList 
                        department="COMMONRAIL" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="mechanic" className="mt-0">
                    <JobList 
                        department="MECHANIC" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกแมคคานิค"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="outsource" className="mt-0">
                    <JobList 
                        department="OUTSOURCE" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานที่ส่งออกร้านนอก"
                        emptyDescription="ยังไม่มีการส่งต่องานสำหรับแผนกนี้"
                    />
                </TabsContent>
            </CardContent>
        </Card>
      </Tabs>
    </>
  );
}
