"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const currentYear = new Date().getFullYear();

  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ประวัติงานซ่อม" description="งานที่ปิดไปแล้วทั้งหมด">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อ/เบอร์โทร/เลขที่จ๊อบ..."
            className="pl-9 w-full sm:w-[300px] bg-background/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </PageHeader>
      <JobTableList 
        searchTerm={searchTerm}
        status="CLOSED"
        source="archive"
        year={currentYear}
        limit={20}
        orderByField="closedDate"
        orderByDirection="desc"
        emptyTitle="ไม่พบประวัติงานซ่อม"
        emptyDescription="ยังไม่มีรายการงานที่ถูกปิดในระบบ หรือไม่พบข้อมูลที่ตรงกับการค้นหา"
      />
    </>
  );
}
