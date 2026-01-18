"use client";

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function KioskOutsidePage() {
  return (
    <>
      <PageHeader title="Outside Kiosk" description="Shared QR code for outside office check-in" />
      <div className="flex justify-center mt-8">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle className="text-2xl font-headline">Outside Check-in</CardTitle>
                <CardDescription>Scan this QR code. For CAR_SERVICE, COMMONRAIL, MECHANIC, OUTSOURCE.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                <QrDisplay />
            </CardContent>
        </Card>
      </div>
    </>
  );
}
