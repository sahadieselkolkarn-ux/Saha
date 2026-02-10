
"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeAllJobsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="จัดการงานซ่อม - งานทั้งหมด" description="แสดงรายการงานซ่อมที่กำลังดำเนินการทั้งหมดทุกแผนก">
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
        excludeStatus="CLOSED"
        limit={20}
        orderByField="lastActivityAt"
        orderByDirection="desc"
        emptyTitle="ไม่พบรายการงาน"
        emptyDescription="ไม่มีงานที่กำลังดำเนินการในระบบขณะนี้"
      />
    </>
  );
}
