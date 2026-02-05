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
  runTransaction
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
import { 
  Loader2, PlusCircle, History, Wallet, ArrowDownCircle, ArrowUpCircle, 
  Lock, Unlock, CheckCircle2, AlertCircle, Camera, X, Image as ImageIcon
} from "lucide-react";
import { cashDrawerStatusLabel } from "@/lib/ui-labels";
import { safeFormat } from "@/lib/date-utils";
import Image from "next/image";
import { cn } from "@/lib/utils";

// --- Types & Schemas ---

const transactionSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  category: z.string().min(1, "Please select a category"),
  description: z.string().min(1, "Please provide a description"),
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
        <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> เพิ่มรายการ</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มรายการเงินสด</DialogTitle>
          <DialogDescription>บันทึกรายการรับเข้าหรือจ่ายออกสำหรับรอบนี้</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>ประเภท</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="IN">รับเข้า (+)</SelectItem><SelectItem value="OUT">จ่ายออก (-)</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>จำนวนเงิน</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage/></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>หมวดหมู่</FormLabel><FormControl><Input {...field}/></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>รายละเอียด</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>
            )} />
            
            <div className="space-y-2">
              <Label>รูปบิล/หลักฐาน</Label>
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
              <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}บันทึกรายการ</Button>
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

  // Listen for History
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "cashDrawerSessions"), where("status", "!=", "OPEN"), orderBy("openedAt", "desc"), limit(10));
    return onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
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

  const handleCloseSession = async (data: CloseSessionFormData) => {
    if (!db || !profile || !activeSession) return;
    setIsClosing(true);
    try {
      const sessionRef = doc(db, "cashDrawerSessions", activeSession.id);
      const diff = data.countedAmount - activeSession.expectedAmount;
      
      await updateDoc(sessionRef, {
        status: 'CLOSED',
        countedAmount: data.countedAmount,
        difference: diff,
        closedAt: serverTimestamp(),
        closedByUid: profile.uid,
        closedByName: profile.displayName,
        notes: data.notes || "",
      });
      toast({ title: 'ปิดรอบเรียบร้อย', description: 'กรุณาส่งเงินทั้งหมดคืนฝ่ายบริหาร' });
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
      <PageHeader title="เงินสดหน้าร้าน" description="จัดการเงินสดรายวันแบบปิดรอบคืนเงินทุกครั้ง" />

      {!activeSession ? (
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>เปิดรอบการทำงานใหม่</CardTitle>
            <CardDescription>กรอกจำนวนเงินทอนเริ่มต้นเพื่อเริ่มบันทึกรายการ</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openingAmount">เงินทอนเริ่มต้น (บาท)</Label>
              <Input 
                id="openingAmount" 
                type="number" 
                value={openingAmount || ''} 
                onChange={(e) => setOpeningAmount(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleOpenSession} disabled={isOpening} className="w-full">
              {isOpening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              เริ่มเปิดรอบ (Open Session)
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2"><CardDescription>ยอดเงินที่ควรมีในลิ้นชัก</CardDescription></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{formatCurrency(activeSession.expectedAmount)}</div>
                <div className="text-xs text-muted-foreground mt-1">เริ่มจาก: {formatCurrency(activeSession.openingAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>สถานะปัจจุบัน</CardDescription></CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge className="text-sm px-3 py-1">{cashDrawerStatusLabel(activeSession.status)}</Badge>
                <div className="text-right">
                  <div className="text-sm font-medium">{activeSession.openedByName}</div>
                  <div className="text-xs text-muted-foreground">{safeFormat(activeSession.openedAt, "HH:mm")}</div>
                </div>
              </CardContent>
            </Card>
            <div className="flex flex-col gap-2">
              <AddTransactionDialog sessionId={activeSession.id} onAdd={handleAddTransaction} />
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full text-destructive border-destructive hover:bg-destructive/10">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> ปิดรอบ (End Session)
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ปิดรอบการทำงาน</DialogTitle>
                    <DialogDescription>นับเงินสดที่มีอยู่ในลิ้นชักจริง และกรอกยอดรวมเพื่อกระทบยอด</DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="p-4 bg-muted rounded-md text-center">
                      <p className="text-sm text-muted-foreground">ยอดเงินที่ควรมี (Expected)</p>
                      <p className="text-2xl font-bold">{formatCurrency(activeSession.expectedAmount)} บาท</p>
                    </div>
                    <div className="space-y-2">
                      <Label>นับเงินสดได้จริง (บาท)</Label>
                      <Input type="number" placeholder="0.00" id="countedAmount" />
                    </div>
                    <div className="space-y-2">
                      <Label>หมายเหตุเพิ่มเติม (ถ้ามี)</Label>
                      <Textarea id="closingNotes" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {}}>ยกเลิก</Button>
                    <Button onClick={() => {
                      const counted = Number((document.getElementById('countedAmount') as HTMLInputElement).value);
                      const notes = (document.getElementById('closingNotes') as HTMLTextAreaElement).value;
                      handleCloseSession({ countedAmount: counted, notes });
                    }} disabled={isClosing}>
                      {isClosing && <Loader2 className="mr-2 animate-spin" />} ยืนยันการปิดรอบ
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>รายการเงินสดรอบปัจจุบัน</CardTitle>
              <Badge variant="outline">{transactions.length} รายการ</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">เวลา</TableHead>
                    <TableHead>รายการ/รายละเอียด</TableHead>
                    <TableHead>หมวดหมู่</TableHead>
                    <TableHead className="text-right pr-6">จำนวน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">ยังไม่มีรายการบันทึก</TableCell></TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="pl-6 text-muted-foreground text-xs">{safeFormat(t.createdAt, "HH:mm")}</TableCell>
                        <TableCell>
                          <div className="font-medium flex items-center gap-2">
                            {t.type === 'IN' ? <ArrowDownCircle className="h-3 w-3 text-green-600"/> : <ArrowUpCircle className="h-3 w-3 text-destructive"/>}
                            {t.description}
                          </div>
                          {t.photos && t.photos.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {t.photos.map((url: string, i: number) => (
                                <Dialog key={i}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 p-0 border"><ImageIcon className="h-3 w-3"/></Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <div className="relative aspect-video">
                                      <Image src={url} alt="receipt" fill className="object-contain" />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.category}</span></TableCell>
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
        <h3 className="text-lg font-bold flex items-center gap-2 text-muted-foreground"><History className="h-5 w-5"/> ประวัติรอบการทำงานล่าสุด</h3>
        <div className="grid gap-4">
          {history.map((s) => (
            <Card key={s.id} className={cn(s.status === 'CLOSED' && "border-amber-200")}>
              <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn("p-2 rounded-full", s.status === 'LOCKED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                    {s.status === 'LOCKED' ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      วันที่ {safeFormat(s.openedAt, "dd/MM/yyyy")}
                      <Badge variant={s.status === 'LOCKED' ? 'default' : 'secondary'}>{cashDrawerStatusLabel(s.status)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">ผู้เปิด: {s.openedByName} • ปิดโดย: {s.closedByName || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:flex md:gap-8 w-full md:w-auto text-sm">
                  <div className="text-center md:text-right">
                    <div className="text-muted-foreground text-[10px] uppercase">ยอดที่ควรมี</div>
                    <div className="font-semibold">{formatCurrency(s.expectedAmount)}</div>
                  </div>
                  <div className="text-center md:text-right">
                    <div className="text-muted-foreground text-[10px] uppercase">นับได้จริง</div>
                    <div className="font-semibold">{formatCurrency(s.countedAmount || 0)}</div>
                  </div>
                  <div className="text-center md:text-right">
                    <div className="text-muted-foreground text-[10px] uppercase">ส่วนต่าง</div>
                    <div className={cn("font-bold", (s.difference || 0) !== 0 ? 'text-destructive' : 'text-green-600')}>
                      {formatCurrency(s.difference || 0)}
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1 pt-2 md:pt-0">
                    {s.status === 'CLOSED' && isMgmt && (
                      <Button size="sm" onClick={() => handleLockSession(s.id)}>ตรวจสอบแล้ว/ล็อก</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
