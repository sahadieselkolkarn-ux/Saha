"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";


// This is a placeholder for the quotation list.
// In a real app, you would fetch and display quotations here.

export default function OfficeQuotationPage() {
  return (
    <>
        <PageHeader title="ใบเสนอราคา" description="สร้างและจัดการใบเสนอราคา">
            <Button asChild>
                <Link href="/app/office/jobs/management/quotation">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Quotation from Job
                </Link>
            </Button>
        </PageHeader>
        <Card>
            <CardHeader>
                <CardTitle>Quotation List</CardTitle>
                <CardDescription>
                    This is where a list of all quotations will be displayed.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p>Coming soon: Table view of all quotations.</p>
            </CardContent>
        </Card>
    </>
  );
}
