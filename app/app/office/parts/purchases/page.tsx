"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OfficePartsPurchasesPage() {
  return (
    <>
      <PageHeader
        title="รายการซื้อ"
        description="บันทึกบิลซื้อ (มีภาษี/ไม่มีภาษี) และส่งให้บัญชีตรวจสอบ"
      >
        <Button asChild>
          <Link href="/app/office/parts/purchases/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างรายการซื้อใหม่
          </Link>
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Purchase List</CardTitle>
          <CardDescription>
            A list of all purchase documents will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            (Placeholder: The list of purchases will be implemented in the next step.)
          </p>
        </CardContent>
      </Card>
    </>
  );
}
