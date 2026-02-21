"use client";

import { useState, useCallback, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, where, getDocs, writeBatch, limit, getCountFromServer } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Database, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export default function AdminUsersPage() {
  const { db, app: firebaseApp } = useFirebase(); // Corrected destructuring from 'app' to 'firebaseApp'
  const { profile } = useAuth();
  const { toast } = useToast();
  
  // Migration States
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);

  // Database Maintenance States
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [unusedTokenCount, setUnusedTokenCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT';
  const isUserAdmin = profile?.role === 'ADMIN';

  const handleMigrate = async () => {
    if (!firebaseApp) {
      toast({ 
        variant: 'destructive', 
        title: "ระบบยังไม่พร้อม", 
        description: "ไม่พบการเชื่อมต่อกับ Firebase App กรุณารีเฟรชหน้าจอแล้วลองใหม่อีกครั้งค่ะ" 
      });
      return;
    }
    
    setIsMigrating(true);
    setMigrationResult(null);
    
    try {
      console.info("Preparing migration call...");
      const functions = getFunctions(firebaseApp, 'us-central1');
      const migrate = httpsCallable(functions, "migrateClosedJobsToArchive2026");
      
      console.info("Executing migrateClosedJobsToArchive2026...");
      const result = await migrate({ limit: 40 });
      const data = result.data as any;
      
      // Normalize results to ensure types are correct for UI
      const totalFound = Number(data.totalFound || 0);
      const migrated = Number(data.migrated || 0);
      const skipped = Number(data.skipped || 0);
      const errors = Array.isArray(data.errors) ? data.errors : [];

      const normalizedResult = { ...data, totalFound, migrated, skipped, errors };
      setMigrationResult(normalizedResult);
      
      if (migrated > 0) {
        toast({ 
          title: "ย้ายข้อมูลสำเร็จ", 
          description: `ย้ายงานที่ปิดแล้วไปประวัติเรียบร้อย ${migrated} รายการค่ะ` 
        });
      } else if (totalFound === 0) {
        toast({ 
          title: "ไม่พบงานรอการย้าย", 
          description: "ในระบบหลักไม่มีงานสถานะ CLOSED หลงเหลืออยู่แล้วค่ะ" 
        });
      } else if (errors.length > 0) {
        toast({ 
          variant: "destructive",
          title: "พบปัญหาบางส่วน", 
          description: `ย้ายสำเร็จ ${migrated} รายการ และผิดพลาด ${errors.length} รายการ` 
        });
      }
    } catch (e: any) {
      console.error("Migration error detail:", e);
      toast({ 
        variant: 'destructive', 
        title: "การเรียกใช้ฟังก์ชันล้มเหลว", 
        description: `Error [${e.code || 'unknown'}]: ${e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อกับ Server"}` 
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const fetchUnusedTokenCount = useCallback(async () => {
    if (!db || !isUserAdmin) return;
    setIsLoadingCount(true);
    try {
      const q = query(collection(db, "kioskTokens"), where("isActive", "==", true));
      const snap = await getCountFromServer(q);
      setUnusedTokenCount(snap.data().count);
    } catch (e: any) {
      if (e.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: 'kioskTokens',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      }
    } finally {
      setIsLoadingCount(false);
    }
  }, [db, isUserAdmin]);

  useEffect(() => {
    if (isUserAdmin) {
      fetchUnusedTokenCount();
    }
  }, [isUserAdmin, fetchUnusedTokenCount]);

  const handleCleanupTokens = async () => {
    if (!db || !isUserAdmin) return;
    
    setIsCleaningUp(true);
    let totalDeleted = 0;
    
    try {
      const performDelete = async (): Promise<number> => {
        const q = query(
          collection(db, "kioskTokens"), 
          where("isActive", "==", true), 
          limit(500)
        );
        
        const snap = await getDocs(q);
        if (snap.empty) return 0;
        
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        
        return snap.size;
      };

      let deletedInThisPass = 0;
      do {
        deletedInThisPass = await performDelete();
        totalDeleted += deletedInThisPass;
        if (deletedInThisPass > 0) await new Promise(r => setTimeout(r, 200));
      } while (deletedInThisPass === 500 && totalDeleted < 20000);

      toast({ 
        title: "ล้างข้อมูลสำเร็จ", 
        description: `ลบ Token ที่ไม่ได้ใช้งานออกทั้งหมด ${totalDeleted} รายการ` 
      });
      await fetchUnusedTokenCount();
    } catch (e: any) {
      if (e.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: 'kioskTokens',
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      } else {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
      }
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="การดูแลรักษาระบบ (System Maintenance)" description="เครื่องมือสำหรับผู้ดูแลระบบเพื่อจัดการข้อมูลและประสิทธิภาพของระบบ" />
      
      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700">
              <Database className="h-5 w-5" />
              <CardTitle className="text-lg">ย้ายงานที่ปิดแล้วเข้าประวัติ (Migration)</CardTitle>
            </div>
            <CardDescription>
              ระบบจะค้นหางานที่มีสถานะ "ปิดงาน" (CLOSED) ที่ยังตกค้างอยู่ในฐานข้อมูลหลัก และย้ายไปยังระบบจัดเก็บประวัติ (Archive) เพื่อเพิ่มความเร็วในการทำงานของแอปค่ะ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="default" className="bg-white border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle>ข้อควรรู้</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                การย้ายจะทำเป็นรอบ รอบละ 40 รายการ หากมีงานค้างจำนวนมาก คุณอาจต้องกดปุ่มนี้หลายครั้งจนกว่าจะขึ้นว่า "ไม่พบงานรอการย้าย" ค่ะ
              </AlertDescription>
            </Alert>

            {migrationResult && (
              <div className={cn(
                "p-4 rounded-md border space-y-2 animate-in fade-in slide-in-from-top-1",
                migrationResult.migrated > 0 ? "bg-green-50 border-green-200" : "bg-muted border-muted"
              )}>
                <div className={cn(
                  "flex items-center gap-2 font-bold text-sm",
                  migrationResult.migrated > 0 ? "text-green-700" : "text-muted-foreground"
                )}>
                  <CheckCircle2 className="h-4 w-4" />
                  สรุปผลการทำงานล่าสุด
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>พบงานในระบบ: <span className="font-bold">{migrationResult.totalFound}</span></div>
                  <div className="text-green-600 font-bold">ย้ายสำเร็จ: {migrationResult.migrated}</div>
                  <div className="text-amber-600">ข้าม/มีในประวัติแล้ว: {migrationResult.skipped}</div>
                </div>
                {migrationResult.errors && migrationResult.errors.length > 0 && (
                  <div className="text-destructive text-[10px] mt-2 border-t pt-2 space-y-1">
                    <p className="font-bold flex items-center gap-1"><XCircle className="h-3 w-3"/> พบข้อผิดพลาด {migrationResult.errors.length} รายการ:</p>
                    <ScrollArea className="h-24">
                        {migrationResult.errors.slice(0, 10).map((err: any, i: number) => (
                        <p key={i}>- จ๊อบ {err.jobId}: {err.message}</p>
                        ))}
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={handleMigrate} 
              disabled={isMigrating}
              className="w-full sm:w-auto min-w-[220px] shadow-sm"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังย้ายข้อมูล...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  เริ่มการย้ายข้อมูล (Migration)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {isUserAdmin && (
        <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                    <Trash2 className="h-5 w-5" />
                    การล้างข้อมูลส่วนเกิน (Database Cleanup)
                </CardTitle>
                <CardDescription>
                    ลบข้อมูลชั่วคราวที่หมดอายุเพื่อเพิ่มพื้นที่ว่างและลดค่าใช้จ่ายฐานข้อมูล
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-sm font-bold">ล้างประวัติ QR Token ลงเวลา</p>
                        <p className="text-xs text-muted-foreground">ลบโค้ดสแกนเวลาที่ไม่ได้ถูกใช้หรือหมดอายุแล้วออกจากระบบ</p>
                        <div className="flex items-center gap-2 mt-2">
                            <p className="text-xs font-bold text-destructive">
                                รายการค้างในระบบ: {isLoadingCount ? <Loader2 className="h-3 w-3 animate-spin inline ml-1"/> : (unusedTokenCount !== null ? `${unusedTokenCount.toLocaleString()} รายการ` : "-")}
                            </p>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchUnusedTokenCount} disabled={isLoadingCount}>
                                <RefreshCw className={cn("h-3 w-3", isLoadingCount && "animate-spin")} />
                            </Button>
                        </div>
                    </div>
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={handleCleanupTokens} 
                        disabled={isCleaningUp || unusedTokenCount === 0}
                    >
                        {isCleaningUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                        {isCleaningUp ? "กำลังดำเนินการ..." : "ล้างข้อมูลส่วนเกิน"}
                    </Button>
                </div>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
