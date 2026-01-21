"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function OfficeJobManagementPage() {
  return (
    <>
      <PageHeader title="บริหารงานซ่อม" description="จัดการและติดตามสถานะงานซ่อมทั้งหมด" />
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">งานทั้งหมด</TabsTrigger>
          <TabsTrigger value="pending">งานรอดำเนินการ</TabsTrigger>
          <TabsTrigger value="waiting">งานรออะไหล่/รอส่งต่อ</TabsTrigger>
          <TabsTrigger value="closing">งานเสร็จรอปิด</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
            <JobList 
                orderByField="createdAt" 
                emptyTitle="No Jobs Found"
                emptyDescription="There are no jobs to display."
            />
        </TabsContent>
        <TabsContent value="pending">
             <JobList
                status="RECEIVED"
                orderByField="createdAt"
                emptyTitle="No Pending Jobs"
                emptyDescription="There are no jobs awaiting action."
            />
        </TabsContent>
        <TabsContent value="waiting">
            <Card>
                <CardHeader>
                    <CardTitle>งานรออะไหล่/รอส่งต่อ</CardTitle>
                    <CardDescription>รายการงานที่อยู่ระหว่างรอชิ้นส่วนหรือรอส่งต่อ</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Coming soon. This feature requires a specific status or tag on the job to filter correctly.</p>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="closing">
             <JobList
                status="DONE"
                orderByField="lastActivityAt"
                emptyTitle="No Jobs Ready for Closing"
                emptyDescription="There are no jobs with status DONE."
            />
        </TabsContent>
      </Tabs>
    </>
  );
}
