"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, ClipboardList, History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { safeFormat } from "@/lib/date-utils";

export default function OfficePartsWithdrawPage() {
  const { db } = useFirebase();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "partWithdrawals"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [db]);

  const filtered = useMemo(() => {
    if (!searchTerm) return withdrawals;
    const q = searchTerm.toLowerCase();
    return withdrawals.filter(w => 
      w.createdByName?.toLowerCase().includes(q) || 
      w.refId?.toLowerCase().includes(q) ||
      w.notes?.toLowerCase().includes(q)
    );
  }, [withdrawals, searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader title="รายการเบิกสินค้า" description="ตรวจสอบและบันทึกการเบิกอะไหล่เพื่อใช้ในการซ่อม">
        <Button asChild>
          <Link href="/app/office/parts/withdraw/new">
            <PlusCircle className="mr-2 h-4 w-4" /> บันทึกการเบิกใหม่
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              ประวัติการเบิกสินค้า
            </CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="ค้นหาชื่อผู้เบิก, เลขอ้างอิง..." 
                className="pl-10"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วัน/เวลา</TableHead>
                  <TableHead>อ้างอิง</TableHead>
                  <TableHead>จำนวนรายการ</TableHead>
                  <TableHead>ผู้เบิก</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filtered.length > 0 ? (
                  filtered.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="text-xs">{safeFormat(w.createdAt, "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {w.refType}: {w.refId?.slice(0, 8)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{w.items?.length || 0} รายการ</TableCell>
                      <TableCell className="text-sm">{w.createdByName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground italic truncate max-w-[200px]">{w.notes || "-"}</TableCell>
                      <TableCell><Badge className="bg-green-600">สำเร็จ</Badge></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">ไม่พบรายการเบิก</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
