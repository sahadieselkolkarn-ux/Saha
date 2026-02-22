"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, FileText, Upload, Trash2, ExternalLink, 
  AlertTriangle, FileUp, Database, Car, Link as LinkIcon
} from "lucide-react";
import type { CarRepairManual } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";

export default function ManualUploadPage() {
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [manuals, setManuals] = useState<CarRepairManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brand, setBrand] = useState("");
  const [manualName, setManualName] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

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

    setIsProcessing(true);
    try {
      const storageRef = ref(storage, `manuals/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "carRepairManuals"), {
        name: file.name,
        url: downloadUrl,
        sourceType: 'UPLOAD',
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
      setIsProcessing(false);
    }
  };

  const handleAddLink = async () => {
    if (!db || !profile || !brand.trim() || !externalUrl.trim() || !manualName.trim()) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "กรุณาระบุยี่ห้อ, ชื่อคู่มือ และลิงก์ Google Drive ค่ะ" });
      return;
    }

    setIsProcessing(true);
    try {
      await addDoc(collection(db, "carRepairManuals"), {
        name: manualName.trim(),
        url: externalUrl.trim(),
        sourceType: 'GDRIVE',
        brand: brand.trim(),
        createdAt: serverTimestamp(),
        createdByUid: profile.uid,
        createdByName: profile.displayName,
      });

      toast({ title: "เพิ่มลิงก์คู่มือสำเร็จ", description: `เพิ่ม ${manualName} (ยี่ห้อ: ${brand}) เข้าสู่ระบบแล้วค่ะ` });
      setBrand("");
      setManualName("");
      setExternalUrl("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "บันทึกไม่สำเร็จ", description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (manual: CarRepairManual) => {
    if (!db || !storage) return;
    if (!confirm(`ยืนยันการลบคู่มือ "${manual.name}"?`)) return;

    try {
      if (manual.sourceType === 'UPLOAD') {
        const fileRef = ref(storage, manual.url);
        await deleteObject(fileRef).catch(e => console.warn("File not found in storage", e));
      }
      await deleteDoc(doc(db, "carRepairManuals", manual.id));
      toast({ title: "ลบสำเร็จ" });
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
        title="คลังคู่มือซ่อมรถยนต์" 
        description="อัปโหลดคู่มือ PDF หรือเพิ่มลิงก์ Google Drive เพื่อให้ AI ใช้เป็นฐานข้อมูล" 
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-dashed bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              เพิ่มข้อมูลใหม่
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upload" className="space-y-4">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="upload" className="text-xs">อัปโหลด PDF</TabsTrigger>
                <TabsTrigger value="link" className="text-xs">ลิงก์ Drive</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                    <Car className="h-3 w-3" /> ยี่ห้อรถ
                  </Label>
                  <Input 
                    placeholder="เช่น Toyota, Isuzu..." 
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    disabled={isProcessing}
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
                    disabled={isProcessing || !brand.trim()}
                  />
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">ยี่ห้อรถ</Label>
                  <Input placeholder="Toyota, Isuzu..." value={brand} onChange={(e)=>setBrand(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">ชื่อคู่มือ</Label>
                  <Input placeholder="Repair Manual 2024..." value={manualName} onChange={(e)=>setManualName(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">ลิงก์ Google Drive</Label>
                  <Input placeholder="https://drive.google.com/..." value={externalUrl} onChange={(e)=>setExternalUrl(e.target.value)} className="bg-background" />
                </div>
                <Button className="w-full" onClick={handleAddLink} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  เพิ่มลิงก์เข้าระบบ
                </Button>
              </TabsContent>
            </Tabs>

            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium justify-center animate-pulse mt-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังดำเนินการ...
              </div>
            )}

            <Alert className="bg-amber-50 border-amber-200 mt-6">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 text-xs">ข้อแนะนำ</AlertTitle>
              <AlertDescription className="text-[10px] text-amber-700">
                หากไฟล์ใหญ่กว่า 20MB แนะนำให้อัปโหลดลง Google Drive และใช้เมนู "ลิงก์ Drive" แทนค่ะ
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
                      <TableHead>ชื่อคู่มือ / ไฟล์</TableHead>
                      <TableHead>ขนาด / แหล่งที่มา</TableHead>
                      <TableHead>เพิ่มเมื่อ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manuals.length > 0 ? manuals.map(m => (
                      <TableRow key={m.id} className="hover:bg-muted/30 text-sm">
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold">
                            {m.brand || "ทั่วไป"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {m.sourceType === 'GDRIVE' ? <LinkIcon className="h-4 w-4 text-blue-500" /> : <FileText className="h-4 w-4 text-red-500" />}
                            <span className="truncate max-w-[250px]">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.sourceType === 'GDRIVE' ? <Badge variant="secondary">Google Drive</Badge> : formatSize(m.fileSize)}
                        </TableCell>
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
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">ยังไม่มีข้อมูลคู่มือในระบบ</TableCell></TableRow>
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
