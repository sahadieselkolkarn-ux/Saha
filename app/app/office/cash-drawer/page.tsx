"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch, 
  limit, 
  getDocs,
  Timestamp,
  runTransaction,
  type FirestoreError
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Loader2, PlusCircle, History, Wallet, ArrowDownCircle, ArrowUpCircle, 
  Lock, Unlock, CheckCircle2, AlertCircle, Camera, X, Image as ImageIcon, ExternalLink
} from "lucide-react";
import { cashDrawerStatusLabel } from "@/lib/ui-labels";
import { safeFormat } from "@/lib/date-utils";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// --- Types & Schemas ---

const transactionSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
  category: z.string().min(1, "กรุณาเลือกหรือระบุหมวดหมู่"),
  description: z.string().min(1, "กรุณาระบุรายละเอียดรายการ"),
});

const closeSessionSchema = z.object({
  countedAmount: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;
type CloseSessionFormData = z.infer<typeof closeSessionSchema>;

const formatCurrency = (val: number) => val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- Components ---

function AddTransactionDialog({ sessionId, onAdd }: { sessionId: string, onAdd: (data: TransactionFormData, photos: File[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { type: "IN", amount: 0, category: "รายรับงานซ่อม", description: "" },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setPhotos(prev => [...prev, ...files]);
      setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (data: TransactionFormData) => {
    setIsSubmitting(true);
    try {
      await onAdd(data, photos);
      setOpen(false);
      form.reset();
      setPhotos([]);
      setPreviews([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" /> บันทึกรายการรับ/จ่าย</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>บันทึกรายการเงินสด</DialogTitle>
          <DialogDescription>บันทึกเงินสดรับเข้าหรือจ่ายออกที่เกิดขึ้นจริงในรอบนี้</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>ประเภทรายการ</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="IN">เงินรับเข้า (+)</SelectItem><SelectItem value="OUT">เงินจ่ายออก (-)</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>จำนวนเงิน (บาท)</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage/></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>หมวดหมู่</FormLabel><FormControl><Input placeholder="เช่น ค่าอะไหล่, รับเงินจากลูกค้า" {...field}/></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>รายละเอียดเพิ่มเติม</FormLabel><FormControl><Textarea placeholder="ระบุเลขที่บิล หรือชื่อลูกค้า..." {...field}/></FormControl></FormItem>
            )} />
            
            <div className="space-y-2">
              <Label>รูปถ่ายบิล/สลิป (ถ้ามี)</Label>
              <div className="flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 border rounded-md overflow-hidden">
                    <Image src={src} alt="preview" fill className="object-cover" />
                    <Button type="button" variant="destructive" size="icon" className="absolute top-0 right-0 h-5 w-5" onClick={() => removePhoto(i)}><X className="h-3 w-3"/></Button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
                  </label>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}บันทึกข้อมูล</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Page ---

export default function OfficeCashDrawerPage() {
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [activeSession, setActiveSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [openingAmount, setOpeningAmount] = useState<number>(0);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingData, setClosingData] = useState<CloseSessionFormData | null>(null);
  
  const [historyIndexUrl, setHistoryIndexUrl] = useState<string | null>(null);

  const isMgmt = profile?.department === 'MANAGEMENT' || profile?.role === 'ADMIN';

  // Listen for Active Session
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "cashDrawerSessions"), where("status", "==", "OPEN"), limit(1));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setActiveSession(data);
      } else {
        setActiveSession(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db]);

  // Listen for Transactions of Active Session
  useEffect(() => {
    if (!db || !activeSession) {
      setTransactions([]);
      return;
    }
    const q = query(
      collection(db, "cashDrawerSessions", activeSession.id, "transactions"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [db, activeSession]);

  // Listen for History with index error handling
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "cashDrawerSessions"), where("status", "!=", "OPEN"), orderBy("openedAt", "desc"), limit(10));
    const unsub = onSnapshot(q, 
      (snap) => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setHistoryIndexUrl(null);
      },
      (err: FirestoreError) => {
        if (err.message?.includes('requires an index')) {
          const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
          if (urlMatch) setHistoryIndexUrl(urlMatch[0]);
        }
      }
    );
    return unsub;
  }, [db]);

  const handleOpenSession = async () => {
    if (!db || !profile) return;
    setIsOpening(true);
    try {
      const q = query(collection(db, "cashDrawerSessions"), where("status", "==", "OPEN"), limit(1));
      const existing = await getDocs(q);
      if (!existing.empty) {
        toast({ variant: 'destructive', title: 'เปิดรอบไม่สำเร็จ', description: 'มีการเปิดรอบค้างไว้แล้ว' });
        return;
      }

      await addDoc(collection(db, "cashDrawerSessions"), {
        status: 'OPEN',
        openedAt: serverTimestamp(),
        openedByUid: profile.uid,
        openedByName: profile.displayName,
        openingAmount: openingAmount,
        expectedAmount: openingAmount,
      });
      toast({ title: 'เปิดรอบการทำงานแล้ว' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsOpening(false);
    }
  };

  const handleAddTransaction = async (data: TransactionFormData, photos: File[]) => {
    if (!db || !storage || !profile || !activeSession) return;
    
    try {
      const uploadedUrls: string[] = [];
      for (const file of photos) {
        const photoRef = ref(storage, `cash-drawer/${activeSession.id}/${Date.now()}-${file.name}`);
        await uploadBytes(photoRef, file);
        uploadedUrls.push(await getDownloadURL(photoRef));
      }

      await runTransaction(db, async (transaction) => {
        const sessionRef = doc(db, "cashDrawerSessions", activeSession.id);
        const transRef = doc(collection(db, "cashDrawerSessions", activeSession.id, "transactions"));
        
        const sessionSnap = await transaction.get(sessionRef);
        const currentExpected = sessionSnap.data()?.expectedAmount || 0;
        const diff = data.type === 'IN' ? data.amount : -data.amount;

        transaction.set(transRef, {
          ...data,
          photos: uploadedUrls,
          createdAt: serverTimestamp(),
          createdByUid: profile.uid,
          createdByName: profile.displayName,
        });

        transaction.update(sessionRef, {
          expectedAmount: currentExpected + diff,
        });
      });

      toast({ title: 'บันทึกรายการสำเร็จ' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleCloseSessionExecute = async () => {
    if (!db || !profile || !activeSession || !closingData) return;
    setIsClosing(true);
    try {
      const sessionRef = doc(db, "cashDrawerSessions", activeSession.id);
      const diff = closingData.countedAmount - activeSession.expectedAmount;
      
      await updateDoc(sessionRef, {
        status: 'CLOSED',
        countedAmount: closingData.countedAmount,
        difference: diff,
        closedAt: serverTimestamp(),
        closedByUid: profile.uid,
        closedByName: profile.displayName,
        notes: closingData.notes || "",
      });
      toast({ title: 'ปิดรอบเรียบร้อย', description: 'กรุณาส่งเงินทั้งหมดคืนฝ่ายบริหาร' });
      setShowCloseConfirm(false);
      setClosingData(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsClosing(false);
    }
  };

  const handleLockSession = async (sessionId: string) => {
    if (!db || !profile || !isMgmt) return;
    try {
      await updateDoc(doc(db, "cashDrawerSessions", sessionId), {
        status: 'LOCKED',
        lockedAt: serverTimestamp(),
        lockedByUid: profile.uid,
        lockedByName: profile.displayName,
      });
      toast({ title: 'ล็อกรอบการทำงานแล้ว', description: 'ยืนยันความถูกต้องเรียบร้อย' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <>
      <PageHeader title="เงินสดหน้าร้าน" description="ระบบบันทึกเงินสดรับ-จ่าย สำหรับใช้วันที่ฝ่ายบริหารไม่อยู่" />

      {!activeSession ? (
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>เปิดใช้งานเงินสดหน้าร้าน</CardTitle>
            <CardDescription className="text-destructive font-medium">
              * ใช้เฉพาะกรณีที่ฝ่ายบัญชีไม่อยู่ เงินสดที่ได้รับต้องนำส่งคืนทั้งหมดเมื่อปิดรอบ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="openingAmount" className="text-base">เงินทอนเริ่มต้น (บาท)</Label>
              <Input 
                id="openingAmount" 
                type="number" 
                value={openingAmount || ''} 
                onChange={(e) => setOpeningAmount(Number(e.target.value))}
                placeholder="0.00"
                className="text-lg"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleOpenSession} disabled={isOpening} className="w-full h-12 text-lg">
              {isOpening && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              เปิดรอบการทำงาน (Open Session)
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2"><CardDescription>ยอดเงินที่ควรมีในลิ้นชัก (รวมเงินทอน)</CardDescription></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{formatCurrency(activeSession.expectedAmount)}</div>
                <div className="text-xs text-muted-foreground mt-1">เงินทอนตั้งต้น: {formatCurrency(activeSession.openingAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>สถานะปัจจุบัน</CardDescription></CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge className="text-sm px-3 py-1 bg-green-100 text-green-800 border-green-200">{cashDrawerStatusLabel(activeSession.status)}</Badge>
                <div className="text-right">
                  <div className="text-sm font-medium">{activeSession.openedByName}</div>
                  <div className="text-xs text-muted-foreground">เริ่มกะ: {safeFormat(activeSession.openedAt, "HH:mm")}</div>
                </div>
              </CardContent>
            </Card>
            <div className="flex flex-col gap-2">
              <AddTransactionDialog sessionId={activeSession.id} onAdd={handleAddTransaction} />
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full text-destructive border-destructive hover:bg-destructive/10">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> ปิดรอบและคืนเงิน (End Session)
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ปิดรอบและสรุปยอดเงินคืน</DialogTitle>
                    <DialogDescription className="text-destructive font-bold">
                      กรุณานับเงินสดจริงในมือให้เรียบร้อยก่อนปิด ระบบจะไม่อนุญาตให้แก้ไขข้อมูลใดๆ หลังจากปิดรอบแล้ว
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="p-4 bg-muted rounded-md text-center border-2 border-dashed">
                      <p className="text-sm text-muted-foreground">ยอดเงินที่ควรมี (ตามบันทึก)</p>
                      <p className="text-2xl font-bold">{formatCurrency(activeSession.expectedAmount)} บาท</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base">นับเงินสดได้จริงทั้งหมด (บาท)</Label>
                      <Input type="number" placeholder="0.00" id="countedAmount" className="text-lg h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label>หมายเหตุการปิดรอบ (ถ้ามี)</Label>
                      <Textarea id="closingNotes" placeholder="ระบุเหตุผลหากเงินขาดหรือเกิน..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {}} className="w-full sm:w-auto">ยกเลิก</Button>
                    <Button onClick={() => {
                      const counted = Number((document.getElementById('countedAmount') as HTMLInputElement).value);
                      const notes = (document.getElementById('closingNotes') as HTMLTextAreaElement).value;
                      setClosingData({ countedAmount: counted, notes });
                      setShowCloseConfirm(true);
                    }} disabled={isClosing} className="w-full sm:w-auto">
                      ยืนยันปิดรอบ
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <CardTitle className="text-lg">รายการรับ-จ่ายในรอบปัจจุบัน</CardTitle>
              <Badge variant="secondary" className="font-normal">{transactions.length} รายการ</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="pl-6 w-24">เวลา</TableHead>
                    <TableHead>รายการ/รายละเอียด</TableHead>
                    <TableHead className="hidden sm:table-cell">หมวดหมู่</TableHead>
                    <TableHead className="text-right pr-6">จำนวนเงิน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center h-32 text-muted-foreground">ยังไม่มีรายการบันทึกในรอบนี้</TableCell></TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id} className="hover:bg-muted/20">
                        <TableCell className="pl-6 text-muted-foreground text-xs">{safeFormat(t.createdAt, "HH:mm")}</TableCell>
                        <TableCell>
                          <div className="font-medium flex items-center gap-2">
                            {t.type === 'IN' ? <ArrowDownCircle className="h-3 w-3 text-green-600"/> : <ArrowUpCircle className="h-3 w-3 text-destructive"/>}
                            {t.description}
                          </div>
                          <div className="sm:hidden text-[10px] text-muted-foreground mt-0.5">{t.category}</div>
                          {t.photos && t.photos.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {t.photos.map((url: string, i: number) => (
                                <Dialog key={i}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 p-0 border bg-background shadow-sm"><ImageIcon className="h-3.5 w-3.5"/></Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <div className="relative aspect-video">
                                      <Image src={url} alt="หลักฐาน" fill className="object-contain" />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><span className="text-xs bg-muted px-2 py-0.5 rounded border">{t.category}</span></TableCell>
                        <TableCell className={cn("text-right pr-6 font-bold", t.type === 'IN' ? 'text-green-600' : 'text-destructive')}>
                          {t.type === 'IN' ? '+' : '-'}{formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Section */}
      <div className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2 text-muted-foreground"><History className="h-5 w-5"/> ประวัติรอบการทำงานล่าสุด</h3>
        </div>
        
        {historyIndexUrl && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>ต้องสร้างดัชนี (Index) ก่อนดูประวัติ</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>ฐานข้อมูลต้องการดัชนีเพื่อจัดเรียงประวัติรอบการทำงาน กรุณากดปุ่มด้านล่างเพื่อสร้าง Index</span>
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a href={historyIndexUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> สร้าง Index สำหรับประวัติ
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          {history.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">ยังไม่มีประวัติการปิดรอบ</p>
          ) : (
            history.map((s) => (
                <Card key={s.id} className={cn(s.status === 'CLOSED' ? "border-amber-300 bg-amber-50/20" : "border-muted shadow-none")}>
                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                    <div className={cn("p-2 rounded-full", s.status === 'LOCKED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                        {s.status === 'LOCKED' ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                    </div>
                    <div>
                        <div className="font-bold flex items-center gap-2">
                        รอบวันที่ {safeFormat(s.openedAt, "dd/MM/yyyy")}
                        <Badge variant={s.status === 'LOCKED' ? 'default' : 'secondary'} className={cn(s.status === 'LOCKED' ? 'bg-green-600' : 'bg-amber-500 text-white')}>
                            {cashDrawerStatusLabel(s.status)}
                        </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">ผู้เปิด: {s.openedByName} • ปิดกะ: {s.closedByName || '-'}</div>
                    </div>
                    </div>
                    <div className="grid grid-cols-2 md:flex md:gap-8 w-full md:w-auto text-sm border-t md:border-0 pt-3 md:pt-0">
                    <div className="text-center md:text-right">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">ยอดควรมี</div>
                        <div className="font-semibold">{formatCurrency(s.expectedAmount)}</div>
                    </div>
                    <div className="text-center md:text-right border-l md:border-0">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">นับได้จริง</div>
                        <div className="font-semibold">{formatCurrency(s.countedAmount || 0)}</div>
                    </div>
                    <div className="text-center md:text-right col-span-2 md:col-span-1 pt-2 md:pt-0">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">ส่วนต่าง</div>
                        <div className={cn("font-bold", (s.difference || 0) !== 0 ? 'text-destructive' : 'text-green-600')}>
                        {formatCurrency(s.difference || 0)}
                        </div>
                    </div>
                    {s.status === 'CLOSED' && isMgmt && (
                        <div className="col-span-2 md:col-span-1 pt-2 md:pt-0">
                            <Button size="sm" onClick={() => handleLockSession(s.id)} className="w-full">ยืนยันเงินคืน/ล็อก</Button>
                        </div>
                    )}
                    </div>
                </CardContent>
                </Card>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการปิดรอบและคืนเงิน?</AlertDialogTitle>
                  <AlertDialogDescription>
                      เมื่อปิดรอบแล้ว <span className="font-bold text-destructive">คุณจะไม่สามารถแก้ไขรายการรับ-จ่ายในรอบนี้ได้อีก</span> และระบบจะสรุปยอดส่วนต่างเพื่อนำส่งฝ่ายบริหารทันที
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isClosing}>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCloseSessionExecute} disabled={isClosing}>
                      {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} ตกลง ปิดรอบ
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
