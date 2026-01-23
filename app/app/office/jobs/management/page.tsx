"use client";

import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function OfficeJobManagementPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม" description="จัดการและติดตามสถานะงานซ่อมทั้งหมด" />
      <Tabs defaultValue="car_service" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="car_service">งานซ่อมหน้าร้าน</TabsTrigger>
          <TabsTrigger value="commonrail">งานคอมมอนเรล</TabsTrigger>
          <TabsTrigger value="mechanic">งานแมคคานิค</TabsTrigger>
          <TabsTrigger value="done">งานเสร็จรอทำบิล</TabsTrigger>
          <TabsTrigger value="history">ประวัติงานซ่อม</TabsTrigger>
        </TabsList>
        <TabsContent value="car_service">
          <JobTableList 
            department="CAR_SERVICE" 
            excludeStatus={["CLOSED"]}
            emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="commonrail">
          <JobTableList 
            department="COMMONRAIL" 
            excludeStatus={["CLOSED"]}
            emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="mechanic">
          <JobTableList 
            department="MECHANIC" 
            excludeStatus={["CLOSED"]}
            emptyTitle="ไม่มีงานในแผนกแมคคานิค"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="done">
          <JobTableList 
            status="DONE"
            emptyTitle="ไม่มีงานที่เสร็จแล้ว"
            emptyDescription="ยังไม่มีงานที่อยู่ในสถานะ 'DONE' รอทำบิล"
          />
        </TabsContent>
        <TabsContent value="history">
          <JobTableList 
            status="CLOSED"
            emptyTitle="ไม่มีประวัติงานซ่อม"
            emptyDescription="ยังไม่มีงานที่ถูกปิดในระบบ"
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
