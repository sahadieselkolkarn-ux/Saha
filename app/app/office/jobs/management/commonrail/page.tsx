"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementCommonrailPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="บริหารงานซ่อม - งานแผนกคอมมอนเรล" description="งานทั้งหมดของแผนก Commonrail">
        <div className="relative w-full sm:w-auto sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer, phone, desc..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </PageHeader>
      <JobTableList 
        department="COMMONRAIL" 
        excludeStatus={["CLOSED"]}
        searchTerm={searchTerm}
        emptyTitle="ไม่มีงานในแผนกคอมมอนเรล"
        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
      />
    </>
  );
}
