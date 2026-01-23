"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WithholdingTaxPage() {
  return (
    <>
      <PageHeader title="ใบหัก ภาษี ณ ที่จ่าย" description="สร้างและจัดการใบหัก ณ ที่จ่าย" />
       <Card>
        <CardHeader>
          <CardTitle>Withholding Tax Certificates List</CardTitle>
          <CardDescription>
            This feature is under development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Coming soon: A list of all withholding tax certificates will be displayed here.</p>
        </CardContent>
      </Card>
    </>
  );
}
