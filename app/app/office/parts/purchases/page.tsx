"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy, where, limit } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, Search, MoreHorizontal, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PurchaseDoc } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { safeFormat } from "@/lib/date-utils";

const getStatusVariant = (status?: PurchaseDoc['status']) => {
  switch (status) {
    case 'DRAFT': return 'secondary';
    case 'SUBMITTED': return 'outline';
    case 'APPROVED':
    case 'UNPAID':
    case 'PAID': return 'default';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

const formatCurrency = (value: number) => {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PurchaseDocsListPage() {
  const { db } = useFirebase();
  const { toast } = useToast();

  const [docs, setDocs] = useState<WithId<PurchaseDoc>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const q = query(collection(db, "purchaseDocs"), orderBy("docDate", "desc"), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<PurchaseDoc>)));
      setLoading(false);
    }, (error) => {
      console.error("Error loading purchase documents: ", error);
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลการซื้อได้" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const filteredDocs = useMemo(() => {
    if (!searchTerm.trim()) return docs;
    const lowercasedFilter = searchTerm.toLowerCase();
    return docs.filter(doc =>
      doc.docNo.toLowerCase().includes(lowercasedFilter) ||
      doc.vendorSnapshot.shortName.toLowerCase().includes(lowercasedFilter) ||
      doc.vendorSnapshot.companyName.toLowerCase().includes(lowercasedFilter) ||
      (doc.invoiceNo && doc.invoiceNo.toLowerCase().includes(lowercasedFilter))
    );
  }, [docs, searchTerm]);

  return (
    <>
      <PageHeader title="รายการซื้อ" description="สร้างและจัดการเอกสารการจัดซื้อ">
        <Button asChild>
          <Link href="/app/office/parts/purchases/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างรายการซื้อใหม่
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาจากเลขที่เอกสาร, ชื่อร้านค้า, เลขที่บิล..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>เลขที่เอกสาร</TableHead>
                  <TableHead>ร้านค้า</TableHead>
                  <TableHead>เลขที่บิล</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">ยอดรวม</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
                ) : filteredDocs.length > 0 ? (
                  filteredDocs.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>{safeFormat(new Date(doc.docDate), 'dd/MM/yy')}</TableCell>
                      <TableCell className="font-medium">{doc.docNo}</TableCell>
                      <TableCell>{doc.vendorSnapshot.shortName}</TableCell>
                      <TableCell>{doc.invoiceNo}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(doc.status)}>{doc.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(doc.grandTotal)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem asChild>
                                <Link href={`/app/office/parts/purchases/${doc.id}`}><Eye className="mr-2"/> ดูรายละเอียด</Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center">ไม่พบเอกสารจัดซื้อ</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}