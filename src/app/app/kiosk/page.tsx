"use client";

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";
import Link from "next/link";

export default function KioskPage() {
  return (
    <>
      <PageHeader title="Kiosk" description="ให้พนักงานสแกน QR Code นี้เพื่อบันทึกเวลา" />
      <div className="flex flex-col items-center justify-center mt-8 gap-8">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Scan to Clock In/Out</CardTitle>
            <CardDescription>
                สแกน QR Code เพื่อเปิดหน้าลงเวลาบนมือถือ
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <QrDisplay path="/app/attendance/scan" />
          </CardContent>
        </Card>
        <Button asChild variant="outline">
          <Link href="/app/attendance/scan">
            <Smartphone className="mr-2 h-4 w-4" />
            เปิดหน้า Scan (สำหรับกรณีไม่สแกน)
          </Link>
        </Button>
      </div>
    </>
  );
}
