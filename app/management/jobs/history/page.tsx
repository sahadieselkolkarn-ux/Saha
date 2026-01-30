import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";

export default function ManagementJobsHistoryPage() {
  return (
    <PageHeader title="ประวัติงาน/ค้นหา" description="ค้นหางานในอดีตทั้งหมด">
        <Button asChild variant="outline">
            <Link href="/management/jobs/import">
                <Upload className="mr-2 h-4 w-4" />
                Import Job History
            </Link>
        </Button>
    </PageHeader>
  );
}
