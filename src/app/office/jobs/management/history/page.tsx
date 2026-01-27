"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { JobTableList } from "@/components/job-table-list";
import { getYear } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const currentYear = getYear(new Date());
const yearOptions = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

export default function OfficeJobManagementHistoryPage() {
  const [year, setYear] = useState<string>(currentYear.toString());
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="ประวัติงานซ่อม" description="งานที่ปิดไปแล้วทั้งหมดในระบบ" />
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2">
            <label htmlFor="year-select" className="text-sm font-medium">ปี:</label>
            <Select value={year} onValueChange={setYear}>
                <SelectTrigger id="year-select" className="w-[120px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="ค้นหาชื่องาน, ลูกค้า, เบอร์โทร, ทะเบียนรถ..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      <JobTableList 
        status="CLOSED"
        limit={100}
        source="archive"
        year={Number(year)}
        searchTerm={searchTerm}
        emptyTitle="ไม่มีประวัติงานซ่อมในปีที่เลือก"
        emptyDescription="ไม่พบข้อมูลงานที่ปิดไปแล้วสำหรับปีนี้"
      />
    </>
  );
}
