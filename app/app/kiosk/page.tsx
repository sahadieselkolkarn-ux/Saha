
"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/client-provider';
import { useToast } from '@/hooks/use-toast';
import { generateKioskToken } from '@/firebase/kiosk';
import { useAuth } from '@/context/auth-context';

import { PageHeader } from "@/components/page-header";
import { QrDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function KioskPage() {
  const { db, auth } = useFirebase();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // KIOSK FEATURE FLAG - Set to false to stop generation
  const KIOSK_ENABLED = false;

  const generateNewToken = useCallback(async (isManual: boolean = false) => {
    if (!KIOSK_ENABLED) return; // Stop if disabled
    
    if (!db || !auth) return;
    if (authLoading || !profile) {
      if (isManual) {
        toast({
          variant: "destructive",
          title: "ยังไม่พร้อม / Not Ready",
          description: "กำลังตรวจสอบการเข้าสู่ระบบ... / Verifying login..."
        });
      }
      return;
    }
    if (isLoading && !isManual) return;

    setIsLoading(true);
    try {
      if (!auth.currentUser) {
          throw new Error("Not authenticated");
      }
      try {
        await auth.currentUser.getIdToken(true);
      } catch (e: any) {
        if (e?.code === 'auth/network-request-failed') {
          console.warn("Auth network failed, continue without token refresh");
        } else {
          throw e;
        }
      }

      const { newTokenId, expiresAtMs: newExpiresAtMs } = await generateKioskToken(db);
      
      setCurrentToken(newTokenId);
      setExpiresAtMs(newExpiresAtMs);
      
      const fullUrl = `${window.location.origin}/app/attendance/scan?k=${newTokenId}`;
      setQrData(fullUrl);
      
    } catch (error: any) {
      console.error("Kiosk token generation failed:", error?.code, error?.message, error);
      toast({
        variant: "destructive",
        title: "Could not generate QR Code",
        description: `${error?.code ?? ""} ${error?.message ?? String(error)}`.trim(),
      });
      setQrData(null);
    } finally {
      setIsLoading(false);
    }
  }, [db, auth, toast, isLoading, authLoading, profile, KIOSK_ENABLED]);

  // Initial token generation
  useEffect(() => {
    if (!db || authLoading || !profile || !KIOSK_ENABLED) return;
    generateNewToken();
  }, [db, authLoading, profile, generateNewToken, KIOSK_ENABLED]);

  // Countdown and auto-refresh timer
  useEffect(() => {
    if (isLoading || !KIOSK_ENABLED) return;

    const intervalId = setInterval(() => {
        if (expiresAtMs) {
            const now = Date.now();
            const newCountdown = Math.max(0, Math.round((expiresAtMs - now) / 1000));
            setCountdown(newCountdown);

            if (newCountdown <= 0) {
                 generateNewToken(); 
            }
        }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isLoading, expiresAtMs, generateNewToken, KIOSK_ENABLED]);


  return (
    <>
      <PageHeader 
        title="Kiosk / หน้าจอลงเวลา" 
        description="Scan this QR Code to record your working time. / ให้พนักงานสแกน QR Code นี้เพื่อบันทึกเวลาทำงาน" 
      />
      <div className="flex flex-col items-center justify-center mt-8 gap-6">
        
        {!KIOSK_ENABLED ? (
          <Card className="w-full max-w-md border-amber-200 bg-amber-50">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="h-12 w-12 text-amber-500" />
              </div>
              <CardTitle className="text-xl text-amber-900">ปิดปรับปรุงชั่วคราว</CardTitle>
              <CardDescription className="text-amber-700">
                ระบบลงเวลาผ่าน QR Code ปิดให้บริการชั่วคราว 
                <br />
                เพื่อปรับปรุงฐานข้อมูล
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <p className="text-sm text-amber-800">
                พนักงานสามารถลงเวลาผ่านช่องทางสำรองที่กำหนดไว้ 
                <br />
                หรือติดต่อหัวหน้างานเพื่อบันทึกเวลาด้วยตนเอง
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-sm text-center">
            <CardHeader>
              <CardTitle className="text-2xl font-headline">Scan to Clock In/Out</CardTitle>
              <CardDescription>
                  Scan QR Code to open the clock-in page on your mobile.
                  <br />
                  สแกน QR Code เพื่อเปิดหน้าลงเวลาบนมือถือ
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <QrDisplay data={qrData} key={currentToken || 'initial'} />
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                {isLoading && !qrData ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating new code...</span>
                  </div>
                ) : (
                  <>
                    <span>Code refreshes in: {countdown}s</span>
                    {currentToken && <p className="text-xs font-mono break-all px-4">TOKEN: {currentToken}</p>}
                  </>
                )}
                <Button onClick={() => generateNewToken(true)} variant="outline" size="sm" disabled={isLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Code / สร้างโค้ดใหม่
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
