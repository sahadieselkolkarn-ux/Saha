"use client";

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Database, AlertTriangle, CheckCircle2 } from "lucide-react";
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
      const migrate = httpsCallable(functions, "migrateClosedJobsToArchive");
      const result = await migrate();
      const data = result.data as any;
      setMigrationResult(data);
      
      if (data.migrated > 0) {
        toast({ title: "Migration Complete", description: `Successfully moved ${data.migrated} jobs.` });
      } else if (data.totalFound > 0) {
        toast({ title: "Migration Finished", description: "Found jobs but they were skipped (possibly wrong year)." });
      } else {
        toast({ title: "Nothing to migrate", description: "No closed jobs found in current collection." });
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
              ย้ายข้อมูลใบงานที่สถานะ "ปิดงาน" แล้ว (CLOSED) จากฐานข้อมูลหลักเข้าสู่ระบบจัดเก็บประวัติ (Archive 2026)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="default" className="bg-white border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle>คำแนะนำ</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                การย้ายข้อมูลจะทำทีละ 40 รายการเพื่อป้องกันระบบขัดข้อง หากมีงานค้างจำนวนมาก กรุณากดปุ่มหลายๆ ครั้งจนกว่าจะขึ้นว่าไม่พบงานรอการย้าย
              </AlertDescription>
            </Alert>

            {migrationResult && (
              <div className="p-4 rounded-md bg-green-50 border border-green-200 space-y-2">
                <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  สรุปการย้ายข้อมูล
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>พบงาน: {migrationResult.totalFound}</div>
                  <div className="text-green-600 font-bold">ย้ายสำเร็จ: {migrationResult.migrated}</div>
                  <div className="text-amber-600">ข้าม (คนละปี): {migrationResult.skipped}</div>
                </div>
                {migrationResult.errors?.length > 0 && (
                  <div className="text-destructive text-[10px] mt-2 border-t pt-2">
                    พบข้อผิดพลาด {migrationResult.errors.length} รายการ
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
