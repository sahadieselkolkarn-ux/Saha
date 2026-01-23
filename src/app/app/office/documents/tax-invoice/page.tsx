"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function OfficeTaxInvoicePage() {
  return (
    <>
      <PageHeader title="ใบกำกับภาษี" description="สร้างและจัดการใบกำกับภาษี">
        <Button asChild>
          <Link href="/app/office/jobs/management/done">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Invoice from Job
          </Link>
        </Button>
      </PageHeader>
       <Card>
            <CardHeader>
                <CardTitle>Tax Invoice List</CardTitle>
                <CardDescription>
                    This is where a list of all tax invoices will be displayed.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p>Coming soon: Table view of all tax invoices.</p>
            </CardContent>
        </Card>
    </>
  );
}
