"use client";

import { useState, useCallback, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, where, getDocs, writeBatch, limit, getCountFromServer, doc, getDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Database, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Trash2, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export default function AdminUsersPage() {
  const { db, app: firebaseApp } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  // Migration States
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);

  // Database Maintenance States
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [unusedTokenCount, setUnusedTokenCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  // Data Repair States
  const [isRepairing, setIsRepairing] = useState(false);

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT';
  const isUserAdmin = profile?.role === 'ADMIN';

  const handleMigrate = async () => {
    if (!firebaseApp) {
      toast({ variant: 'destructive', title: "ระบบยังไม่พร้อม", description: "ไม่พบการเชื่อมต่อกับ Firebase App" });
      return;
    }
    setIsMigrating(true);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const migrate = httpsCallable(functions, "migrateClosedJobsToArchive2026");
      const result = await migrate({ limit: 40 });
      setMigrationResult(result.data);
      toast({ title: "ย้ายข้อมูลสำเร็จ" });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "ล้มเหลว", description: e.message });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleRepairData = async () => {
    if (!db || !isUserAdmin) return;
    setIsRepairing(true);
    let repairedCount = 0;
    let closedCount = 0;

    try {
      const jobsSnap = await getDocs(query(collection(db, "jobs"), limit(500)));
      const batch = writeBatch(db);
      let batchSize = 0;

      for (const jobDoc of jobsSnap.docs) {
        const jobData = jobDoc.data();
        let needsUpdate = false;
        const updatePayload: any = {};

        // 1. Sync missing salesDocNo
        if (jobData.salesDocId && !jobData.salesDocNo) {
          const docSnap = await getDoc(doc(db, "documents", jobData.salesDocId));
          if (docSnap.exists()) {
            updatePayload.salesDocNo = docSnap.data().docNo;
            needsUpdate = true;
            repairedCount++;
          }
        }

        // 2. Auto-close PAID jobs
        if (jobData.salesDocId && jobData.status !== 'CLOSED') {
          const docSnap = await getDoc(doc(db, "documents", jobData.salesDocId));
          if (docSnap.exists() && docSnap.data().status === 'PAID') {
            updatePayload.status = 'CLOSED';
            updatePayload.updatedAt = serverTimestamp();
            needsUpdate = true;
            closedCount++;
          }
        }

        if (needsUpdate) {
          batch.update(jobDoc.ref, updatePayload);
          batchSize++;
          if (batchSize >= 400) {
            await batch.commit();
            batchSize = 0;
          }
        }
      }

      if (batchSize > 0) await batch.commit();
      
      toast({ 
        title: "ซ่อมแซมข้อมูลสำเร็จ", 
        description: `ซิงค์เลขบิล ${repairedCount} รายการ และปิดจ๊อบที่รับเงินแล้ว ${closedCount} รายการค่ะ` 
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: e.message });
    } finally {
      setIsRepairing(false);
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
      console.error(e);
    } finally {
      setIsLoadingCount(false);
    }
  }, [db, isUserAdmin]);

  useEffect(() => {
    if (isUserAdmin) fetchUnusedTokenCount();
  }, [isUserAdmin, fetchUnusedTokenCount]);

  const handleCleanupTokens = async () => {
    if (!db || !isUserAdmin) return;
    setIsCleaningUp(true);
    try {
      const q = query(collection(db, "kioskTokens"), where("isActive", "==", true), limit(500));
      const snap = await getDocs(q);
      if (snap.empty) { setIsCleaningUp(false); return; }
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast({ title: "ล้างข้อมูลสำเร็จ" });
      await fetchUnusedTokenCount();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "ผิดพลาด", description: e.message });
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="การดูแลรักษาระบบ" description="เครื่องมือสำหรับ Admin เพื่อจัดการข้อมูลและประสิทธิภาพ" />
      
      {isUserAdmin && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <div className="flex items-center gap-2 text-blue-700">
              <Wrench className="h-5 w-5" />
              <CardTitle className="text-lg">ซ่อมแซมและซิงค์ข้อมูล (Data Repair)</CardTitle>
            </div>
            <CardDescription>
              ใช้สำหรับแก้ไขปัญหาจ๊อบไม่ยอมปิดทั้งที่รับเงินแล้ว หรือแก้ปัญหาปุ่ม "ดูบิล" ไม่แสดงเลขที่เอกสารให้เป็นระเบียบเหมือนกันทุกใบค่ะ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleRepairData} disabled={isRepairing} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
              {isRepairing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              ตรวจสอบและซ่อมแซมข้อมูลงานซ่อม
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700">
              <Database className="h-5 w-5" />
              <CardTitle className="text-lg">ย้ายงานที่ปิดแล้วเข้าประวัติ (Migration)</CardTitle>
            </div>
            <CardDescription>
              ระบบจะย้ายงานสถานะ CLOSED ที่ตกค้างไปยัง Archive เพื่อให้แอปทำงานเร็วขึ้น
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {migrationResult && (
              <div className="p-4 rounded-md border bg-green-50 border-green-200 text-xs">
                <p className="font-bold text-green-700 mb-1">สรุปผลล่าสุด:</p>
                <p>พบงาน: {migrationResult.totalFound} | ย้ายสำเร็จ: {migrationResult.migrated} | ข้าม: {migrationResult.skipped}</p>
              </div>
            )}
            <Button onClick={handleMigrate} disabled={isMigrating} className="w-full sm:w-auto">
              {isMigrating ? <Loader2 className="mr-2 animate-spin" /> : <RefreshCw className="mr-2" />}
              เริ่มการย้ายข้อมูล (Migration)
            </Button>
          </CardContent>
        </Card>
      )}

      {isUserAdmin && (
        <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                    <Trash2 className="h-5 w-5" />
                    ล้างข้อมูลส่วนเกิน (Cleanup)
                </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between items-center">
                <div className="text-sm">
                    <p className="font-bold">ล้างประวัติ QR Token ลงเวลา</p>
                    <p className="text-muted-foreground">รายการค้าง: {isLoadingCount ? "..." : unusedTokenCount?.toLocaleString() || "0"}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleCleanupTokens} disabled={isCleaningUp || unusedTokenCount === 0}>
                    {isCleaningUp ? <Loader2 className="mr-2 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                    ล้างข้อมูล
                </Button>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
