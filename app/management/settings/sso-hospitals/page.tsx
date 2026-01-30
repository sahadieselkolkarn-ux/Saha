"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, PlusCircle } from "lucide-react";
import type { SSOHospital } from "@/lib/types";

export default function SsoHospitalsPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [items, setItems] = useState<(SSOHospital & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "ssoHospitals"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    }, (e) => {
      toast({ variant: "destructive", title: "โหลดไม่สำเร็จ", description: e.message });
      setLoading(false);
    });
    return () => unsub();
  }, [db, toast]);

  const addHospital = async () => {
    if (!db || !name.trim()) return;
    try {
      await addDoc(collection(db, "ssoHospitals"), { name: name.trim(), createdAt: serverTimestamp() });
      setName("");
      toast({ title: "เพิ่มโรงพยาบาลแล้ว" });
    } catch (e:any) {
      toast({ variant: "destructive", title: "เพิ่มไม่สำเร็จ", description: e.message });
    }
  };

  const removeHospital = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "ssoHospitals", id));
      toast({ title: "ลบแล้ว" });
    } catch (e:any) {
      toast({ variant: "destructive", title: "ลบไม่สำเร็จ", description: e.message });
    }
  };

  return (
    <>
      <PageHeader title="รพ. ประกันสังคม" description="จัดการรายการโรงพยาบาลประกันสังคม" />
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>เพิ่มโรงพยาบาล</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="ชื่อโรงพยาบาล" />
            <Button onClick={addHospital}><PlusCircle className="mr-2 h-4 w-4" /> เพิ่ม</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>รายการ</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-6"><Loader2 className="animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>ชื่อ</TableHead><TableHead className="text-right">ลบ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map(h => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeHospital(h.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
