"use client";

import { useState, useMemo, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { 
  Loader2, FileText, Upload, Trash2, ExternalLink, 
  AlertTriangle, FileUp, Database, Car
} from "lucide-react";
import type { CarRepairManual } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

export default function ManualUploadPage() {
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [manuals, setManuals] = useState<CarRepairManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [brand, setBrand] = useState("");

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "carRepairManuals"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setManuals(snap.docs.map(d => ({ id: d.id, ...d.data() } as CarRepairManual)));
      setLoading(false);
    });
  }, [db]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db || !storage || !profile) return;

    if (!brand.trim()) {
      toast({ variant: "destructive", title: "กรุณาระบุยี่ห้อรถ", description: "ระบุยี่ห้อรถเพื่อให้ AI ค้นหาข้อมูลได้แม่นยำขึ้นค่ะ" });
      e.target.value = "";
      return;
    }

    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "เฉพาะไฟล์ PDF เท่านั้น", description: "กรุณาอัปโหลดไฟล์คู่มือในรูปแบบ PDF ค่ะ" });
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      toast({ variant: "destructive", title: "ไฟล์ใหญ่เกินไป", description: "จำกัดขนาดไฟล์ไม่เกิน 30MB ค่ะ" });
      return;
    }

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `manuals/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "carRepairManuals"), {
        name: file.name,
        url: downloadUrl,
        brand: brand.trim(),
        fileSize: file.size,
        createdAt: serverTimestamp(),
        createdByUid: profile.uid,
        createdByName: profile.displayName,
      });

      toast({ title: "อัปโหลดคู่มือสำเร็จ", description: `เพิ่มไฟล์ ${file.name} (ยี่ห้อ: ${brand}) เข้าสู่ระบบแล้วค่ะ` });
      setBrand("");
      e.target.value = "";
    } catch (error: any) {
      toast({ variant: "destructive", title: "อัปโหลดไม่สำเร็จ", description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (manual: CarRepairManual) => {
    if (!db || !storage) return;
    if (!confirm(`ยืนยันการลบคู่มือ "${manual.name}"?`)) return;

    try {
      // 1. Delete from Storage
      const fileRef = ref(storage, manual.url);
      await deleteObject(fileRef).catch(e => console.warn("File not found in storage", e));

      // 2. Delete from Firestore
      await deleteDoc(doc(db, "carRepairManuals", manual.id));
      toast({ title: "ลบไฟล์สำเร็จ" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "ลบไม่สำเร็จ", description: e.message });
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "-";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="คลังคู่มือ PDF" 
        description="อัปโหลดคู่มือการซ่อม (Repair Manual) เพื่อให้ AI ใช้เป็นฐานข้อมูลในการวิเคราะห์ปัญหา" 
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-dashed bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              เพิ่มคู่มือใหม่
            </CardTitle>
            <CardDescription>จัดหมวดหมู่ก่อนอัปโหลด</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Car className="h-3 w-3" /> ยี่ห้อรถ
              </Label>
              <Input 
                id="brand"
                placeholder="เช่น Toyota, Isuzu..." 
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={isUploading}
                className="bg-background"
              />
            </div>

            <div className={cn(
              "flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer relative",
              !brand.trim() ? "opacity-50 grayscale cursor-not-allowed" : "hover:bg-muted/50"
            )}>
              <Upload className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-[10px] text-center text-muted-foreground">
                {!brand.trim() ? "กรุณาระบุยี่ห้อรถก่อน" : "คลิกเพื่อเลือกไฟล์ PDF"}
              </p>
              <Input 
                type="file" 
                accept=".pdf" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleFileUpload}
                disabled={isUploading || !brand.trim()}
              />
            </div>

            {isUploading && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium justify-center animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังอัปโหลด...
              </div>
            )}

            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 text-xs">ข้อแนะนำ</AlertTitle>
              <AlertDescription className="text-[10px] text-amber-700">
                การระบุยี่ห้อรถที่ถูกต้องจะช่วยให้ AI แยกแยะข้อมูลเทคนิคได้แม่นยำมากค่ะ
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              รายการคู่มือในระบบ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-32">ยี่ห้อรถ</TableHead>
                      <TableHead>ชื่อไฟล์คู่มือ</TableHead>
                      <TableHead>ขนาด</TableHead>
                      <TableHead>อัปโหลดเมื่อ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manuals.length > 0 ? manuals.map(m => (
                      <TableRow key={m.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold">
                            {m.brand || "ทั่วไป"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-red-500 shrink-0" />
                            <span className="truncate max-w-[250px]">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatSize(m.fileSize)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{safeFormat(m.createdAt, "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" asChild title="เปิดดู">
                              <a href={m.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} className="text-destructive" title="ลบ">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">ยังไม่มีการอัปโหลดคู่มือเข้าระบบ</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
