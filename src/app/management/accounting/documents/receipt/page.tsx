"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReceiptPage() {
  return (
     <>
      <PageHeader title="ใบเสร็จรับเงิน" description="สร้างและจัดการใบเสร็จรับเงิน" />
      <Card>
        <CardHeader>
          <CardTitle>Receipts List</CardTitle>
          <CardDescription>
            This feature is under development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Coming soon: A list of all receipts will be displayed here.</p>
        </CardContent>
      </Card>
    </>
  );
}
