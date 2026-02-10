"use client";

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Database, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminUsersPage() {
  const { firebaseApp } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';

  const handleMigrate = async () => {
    if (!firebaseApp) return;
    setIsMigrating(true);
    setMigrationResult(null);
    
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const migrate = httpsCallable(functions, "migrateClosedJobsToArchive2026");
      const result = await migrate();
      const data = result.data as any;
      setMigrationResult(data);
      
      if (data.migrated > 0) {
        toast({ title: "Migration Success", description: `ย้ายข้อมูลสำเร็จ ${data.migrated} รายการ` });
      } else if (data.totalFound > 0) {
        toast({ title: "No jobs migrated", description: "พบงานแต่ไม่มีรายการที่ย้ายได้ในรอบนี้" });
      } else {
        toast({ title: "Done", description: "ไม่พบงานสถานะ CLOSED ค้างในระบบแล้ว" });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Migration Failed", description: e.message });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Manage users and system maintenance tasks." />
      
      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700">
              <Database className="h-5 w-5" />
              <CardTitle className="text-lg">System Maintenance</CardTitle>
            </div>
            <CardDescription>
              ย้ายข้อมูลใบงานที่สถานะ "ปิดงาน" (CLOSED) ที่ยังค้างอยู่ในระบบ ไปยังระบบจัดเก็บประวัติ (Archive 2026)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="default" className="bg-white border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle>คำแนะนำ</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                การย้ายข้อมูลจะทำทีละ 40 รายการเพื่อความปลอดภัย หากมีงานค้างจำนวนมาก กรุณากดปุ่มซ้ำจนกว่าจะขึ้นว่าไม่พบงานรอการย้าย
              </AlertDescription>
            </Alert>

            {migrationResult && (
              <div className={cn(
                "p-4 rounded-md border space-y-2",
                migrationResult.migrated > 0 ? "bg-green-50 border-green-200" : "bg-muted border-muted"
              )}>
                <div className={cn(
                  "flex items-center gap-2 font-bold text-sm",
                  migrationResult.migrated > 0 ? "text-green-700" : "text-muted-foreground"
                )}>
                  <CheckCircle2 className="h-4 w-4" />
                  สรุปผลการย้ายประวัติ
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>พบงานค้าง: <span className="font-bold">{migrationResult.totalFound}</span></div>
                  <div className="text-green-600 font-bold">ย้ายสำเร็จ: {migrationResult.migrated}</div>
                  <div className="text-amber-600">ข้าม: {migrationResult.skipped}</div>
                </div>
                {migrationResult.errors?.length > 0 && (
                  <div className="text-destructive text-[10px] mt-2 border-t pt-2 space-y-1">
                    <p className="font-bold flex items-center gap-1"><XCircle className="h-3 w-3"/> พบข้อผิดพลาด {migrationResult.errors.length} รายการ:</p>
                    {migrationResult.errors.slice(0, 3).map((err: any, i: number) => (
                      <p key={i}>- Job {err.jobId}: {err.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={handleMigrate} 
              disabled={isMigrating}
              className="w-full sm:w-auto"
            >
              {isMigrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              เริ่มการย้ายข้อมูลประวัติ (Migration)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
