"use client";

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function KioskOfficePage() {
  return (
    <>
      <PageHeader title="Office Kiosk" description="QR code for Common Rail department office" />
      <div className="flex justify-center mt-8">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle className="text-2xl font-headline">Common Rail - Office</CardTitle>
                <CardDescription>Please scan this QR code to proceed.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                <QrDisplay />
            </CardContent>
        </Card>
      </div>
    </>
  );
}
