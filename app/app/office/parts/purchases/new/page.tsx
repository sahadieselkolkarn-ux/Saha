"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function NewPurchasePage() {
  return (
    <>
      <PageHeader
        title="สร้างรายการซื้อใหม่"
        description="Fill out the form below to create a new purchase document."
      />
      <Card>
        <CardHeader>
            <CardTitle>New Purchase Form</CardTitle>
            <CardDescription>This form will be implemented in the next step.</CardDescription>
        </CardHeader>
        <CardContent>
            <Button asChild variant="outline">
                <Link href="/app/office/parts/purchases">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Purchases List
                </Link>
            </Button>
        </CardContent>
      </Card>
    </>
  );
}
