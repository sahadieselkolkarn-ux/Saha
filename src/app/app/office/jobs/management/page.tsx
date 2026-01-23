"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="บริหารงานซ่อม" description="จัดการและติดตามสถานะงานซ่อมทั้งหมด" />
      <Tabs defaultValue="car_service" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
            <TabsTrigger value="car_service">งานซ่อมหน้าร้าน</TabsTrigger>
            <TabsTrigger value="commonrail">งานแผนกคอมมอนเรล</TabsTrigger>
            <TabsTrigger value="mechanic">งานแผนกแมคคานิค</TabsTrigger>
            <TabsTrigger value="done">งานเสร็จรอทำบิล</TabsTrigger>
            <TabsTrigger value="history">ประวัติงานซ่อม</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-auto sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, phone, desc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <TabsContent value="car_service">
          <JobTableList 
            department="CAR_SERVICE" 
            excludeStatus={["CLOSED"]}
            searchTerm={searchTerm}
            emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="commonrail">
          <JobTableList 
            department="COMMONRAIL" 
            excludeStatus={["CLOSED"]}
            searchTerm={searchTerm}
            emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="mechanic">
          <JobTableList 
            department="MECHANIC" 
            excludeStatus={["CLOSED"]}
            searchTerm={searchTerm}
            emptyTitle="ไม่มีงานในแผนกแมคคานิค"
            emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
          />
        </TabsContent>
        <TabsContent value="done">
          <JobTableList 
            status="DONE"
            searchTerm={searchTerm}
            emptyTitle="ไม่มีงานที่เสร็จแล้ว"
            emptyDescription="ยังไม่มีงานที่อยู่ในสถานะ 'DONE' รอทำบิล"
          />
        </TabsContent>
        <TabsContent value="history">
          <JobTableList 
            status="CLOSED"
            searchTerm={searchTerm}
            emptyTitle="ไม่มีประวัติงานซ่อม"
            emptyDescription="ยังไม่มีงานที่ถูกปิดในระบบ"
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
