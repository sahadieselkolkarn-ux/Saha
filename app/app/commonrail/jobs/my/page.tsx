"use client";

import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CommonrailMyJobsPage() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  
  if (!profile) {
     return (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>ไม่สามารถโหลดข้อมูลผู้ใช้ได้</CardTitle>
                <CardDescription>กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง</CardDescription>
            </CardHeader>
        </Card>
     );
  }

  return (
    <>
      <PageHeader title="งานของฉัน" description="งานที่อยู่ในความรับผิดชอบของคุณ" />
      <JobList 
        department="COMMONRAIL" 
        status={['IN_PROGRESS', 'IN_REPAIR_PROCESS']}
        assigneeUid={profile.uid}
        emptyTitle="คุณยังไม่มีงานที่กำลังทำ"
        emptyDescription="ไปที่หน้า 'งานทั้งหมด' เพื่อรับงานใหม่"
      />
    </>
  );
}
