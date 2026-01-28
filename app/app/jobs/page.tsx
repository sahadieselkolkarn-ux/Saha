"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search } from "lucide-react";
import { JobList } from "@/components/job-list";

export default function JobsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <>
      <PageHeader title="Job List" description="View and manage all ongoing jobs.">
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search name, phone, etc..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button asChild>
                <Link href="/app/office/intake">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Job
                </Link>
            </Button>
        </div>
      </PageHeader>
      
      <JobList
        searchTerm={searchTerm}
        excludeStatus={['CLOSED']}
        emptyTitle="No Ongoing Jobs Found"
        emptyDescription="There are no active jobs to display."
      >
        <Button asChild>
            <Link href="/app/office/intake">Create the first job</Link>
        </Button>
      </JobList>
    </>
  );
}
