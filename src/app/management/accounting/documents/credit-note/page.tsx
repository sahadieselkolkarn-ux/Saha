"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreditNotePage() {
  return (
    <>
      <PageHeader title="ใบลดหนี้" description="สร้างและจัดการใบลดหนี้" />
      <Card>
        <CardHeader>
          <CardTitle>Credit Notes List</CardTitle>
          <CardDescription>
            This feature is under development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Coming soon: A list of all credit notes will be displayed here.</p>
        </CardContent>
      </Card>
    </>
  );
}
