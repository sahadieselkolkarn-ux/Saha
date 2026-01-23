"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OfficeDeliveryNotePage() {
  return (
    <>
      <PageHeader title="ใบส่งสินค้า" description="สร้างและจัดการใบส่งสินค้า" />
      <Card>
        <CardHeader>
          <CardTitle>Delivery Notes List</CardTitle>
          <CardDescription>
            This feature is under development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Coming soon: A list of all delivery notes will be displayed here.</p>
        </CardContent>
      </Card>
    </>
  );
}
