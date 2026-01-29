"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementByDepartmentPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ตามแผนก" description="แสดงงานทั้งหมดที่ยังไม่ปิด แยกตามแผนกที่รับผิดชอบ" />
      <Tabs defaultValue="car-service">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <TabsList>
            <TabsTrigger value="car-service">งานซ่อมหน้าร้าน</TabsTrigger>
            <TabsTrigger value="commonrail">แผนกคอมมอนเรล</TabsTrigger>
            <TabsTrigger value="mechanic">แผนกแมคคานิค</TabsTrigger>
            <TabsTrigger value="outsource">งานส่งออกร้านนอก</TabsTrigger>
          </TabsList>
          <div className="relative w-full md:w-auto md:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อ/เบอร์โทร..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <Card>
            <CardContent className="p-0">
                <TabsContent value="car-service" className="mt-0">
                    <JobList 
                        searchTerm={searchTerm}
                        department="CAR_SERVICE" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="commonrail" className="mt-0">
                    <JobList 
                        searchTerm={searchTerm}
                        department="COMMONRAIL" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="mechanic" className="mt-0">
                    <JobList 
                        searchTerm={searchTerm}
                        department="MECHANIC" 
                        excludeStatus={["CLOSED"]}
                        emptyTitle="ไม่มีงานในแผนกแมคคานิค"
                        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
                    />
                </TabsContent>
                <TabsContent value="outsource" className="mt-0">
                    <JobList 
                        searchTerm={searchTerm}
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
