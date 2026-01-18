"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { generateKioskToken } from '@/firebase/kiosk';

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";

const TOKEN_REFRESH_INTERVAL = 30; // seconds

export default function KioskPage() {
  const { db } = useFirebase();
  const { toast } = useToast();

  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(TOKEN_REFRESH_INTERVAL);
  const [isLoading, setIsLoading] = useState(false);

  const generateNewToken = useCallback(async (isManual: boolean = false) => {
    if (!db) return;
    if (isLoading && !isManual) return;

    setIsLoading(true);
    try {
      // Pass the current token to be deactivated
      const newToken = await generateKioskToken(db, currentToken);
      setCurrentToken(newToken);
      
      const fullUrl = `${window.location.origin}/app/attendance/scan?k=${newToken}`;
      setQrData(fullUrl);
      
      setCountdown(TOKEN_REFRESH_INTERVAL);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not generate QR Code",
        description: error.message,
      });
      setQrData(null);
    } finally {
      setIsLoading(false);
    }
  }, [db, toast, currentToken, isLoading]);

  // Initial token generation
  useEffect(() => {
    // This effect runs only once on mount to generate the first token.
    generateNewToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]); // Depend on db to ensure it's available.

  // Countdown and auto-refresh timer
  useEffect(() => {
    if (isLoading) return;

    const intervalId = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          generateNewToken(); 
          return TOKEN_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isLoading, generateNewToken]);


  return (
    <>
      <PageHeader title="Kiosk" description="ให้พนักงานสแกน QR Code นี้เพื่อบันทึกเวลา" />
      <div className="flex flex-col items-center justify-center mt-8 gap-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Scan to Clock In/Out</CardTitle>
            <CardDescription>
                สแกน QR Code เพื่อเปิดหน้าลงเวลาบนมือถือ
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <QrDisplay data={qrData} />
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              {isLoading && !qrData ? ( // Show only on initial load
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating new code...</span>
                </div>
              ) : (
                <span>Code refreshes in: {countdown}s</span>
              )}
              <Button onClick={() => generateNewToken(true)} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Code
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
