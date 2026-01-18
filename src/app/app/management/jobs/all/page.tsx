"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { JobList } from "@/components/job-list";

export default function AllJobsPage() {
  return (
    <>
      <PageHeader title="All Jobs" description="View and manage all ongoing and past jobs from every department.">
        <Button asChild>
            <Link href="/app/office/intake">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Job
            </Link>
        </Button>
      </PageHeader>
      
      <JobList
        emptyTitle="No Jobs Found"
        emptyDescription="There are no jobs to display."
      >
        <Button asChild>
            <Link href="/app/office/intake">Create the first job</Link>
        </Button>
      </JobList>
    </>
  );
}
