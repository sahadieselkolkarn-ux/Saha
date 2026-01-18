"use client";

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function KioskFrontPage() {
  return (
    <>
      <PageHeader title="Kiosk Front" description="QR Code for Common Rail Department Front Desk" />
      <div className="flex justify-center mt-8">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle className="text-2xl font-headline">Common Rail - Front Desk</CardTitle>
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
