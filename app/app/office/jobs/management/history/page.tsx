
"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  return (
    <>
      <PageHeader title="จัดการงานซ่อม - ประวัติงานซ่อม" description="งานที่ปิดไปแล้วทั้งหมด">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อ/เบอร์โทร..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </PageHeader>
      <JobTableList 
        searchTerm={searchTerm}
        status="CLOSED"
        limit={10}
        orderByField="closedDate"
        orderByDirection="desc"
        emptyTitle="ไม่มีประวัติงานซ่อม"
        emptyDescription="ยังไม่มีการเปิดงานที่ถูกปิดในระบบ"
      />
    </>
  );
}
