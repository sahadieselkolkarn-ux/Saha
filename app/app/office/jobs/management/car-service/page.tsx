"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function OfficeJobManagementCarServicePage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="บริหารงานซ่อม - งานซ่อมหน้าร้าน" description="งานทั้งหมดของแผนก Car Service">
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
        department="CAR_SERVICE" 
        excludeStatus={["CLOSED"]}
        searchTerm={searchTerm}
        emptyTitle="ไม่มีงานในแผนกซ่อมหน้าร้าน"
        emptyDescription="ยังไม่มีการเปิดงานสำหรับแผนกนี้"
      />
    </>
  );
}
