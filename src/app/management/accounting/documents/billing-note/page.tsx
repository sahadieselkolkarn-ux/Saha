"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BillingNotePage() {
  return (
    <>
      <PageHeader title="ใบวางบิล" description="สร้างและจัดการใบวางบิล" />
      <Card>
        <CardHeader>
          <CardTitle>Billing Notes List</CardTitle>
          <CardDescription>
            This feature is under development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Coming soon: A list of all billing notes will be displayed here.</p>
        </CardContent>
      </Card>
    </>
  );
}
