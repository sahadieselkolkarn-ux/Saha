"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date-utils";
import type { PurchaseDoc } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";

const getStatusVariant = (status: PurchaseDoc['status']) => {
  switch (status) {
    case 'DRAFT': return 'secondary';
    case 'SUBMITTED': return 'outline';
    case 'APPROVED': return 'default';
    case 'UNPAID': return 'default';
    case 'PAID': return 'default';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

export default function OfficePartsPurchasesPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [docs, setDocs] = useState<WithId<PurchaseDoc>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("with_tax");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const q = query(collection(db, "purchaseDocs"), orderBy("docDate", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<PurchaseDoc>)));
      setLoading(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลได้", description: error.message });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, toast]);
  
  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
        const matchesTab = activeTab === 'with_tax' ? doc.withTax : !doc.withTax;
        
        if (!searchTerm) return matchesTab;

        const lowerSearch = searchTerm.toLowerCase();
        const matchesSearch = doc.vendorSnapshot.companyName.toLowerCase().includes(lowerSearch) ||
                              doc.invoiceNo.toLowerCase().includes(lowerSearch) ||
                              doc.docNo.toLowerCase().includes(lowerSearch);
        
        return matchesTab && matchesSearch;
    });
  }, [docs, activeTab, searchTerm]);

  return (
    <>
      <PageHeader
        title="รายการซื้อ"
        description="บันทึกบิลซื้อ (มีภาษี/ไม่มีภาษี) และส่งให้บัญชีตรวจสอบ"
      >
        <Button asChild>
          <Link href="/app/office/parts/purchases/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            สร้างรายการซื้อใหม่
          </Link>
        </Button>
      </PageHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <TabsList>
                <TabsTrigger value="with_tax">มีภาษี</TabsTrigger>
                <TabsTrigger value="without_tax">ไม่มีภาษี</TabsTrigger>
            </TabsList>
             <div className="relative w-full sm:w-auto sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="ค้นหา ร้านค้า, เลขบิล, เลขเอกสาร..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>
        </div>
        <Card>
            <CardContent className="pt-6">
                {loading ? (
                    <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
                ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>วันที่</TableHead>
                            <TableHead>เลขที่เอกสาร</TableHead>
                            <TableHead>ร้านค้า</TableHead>
                            <TableHead>เลขที่บิล</TableHead>
                            <TableHead className="text-right">ยอดรวม</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead className="text-right">จัดการ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredDocs.length > 0 ? (
                           filteredDocs.map(doc => (
                            <TableRow key={doc.id}>
                                <TableCell>{safeFormat(new Date(doc.docDate), 'dd/MM/yy')}</TableCell>
                                <TableCell className="font-medium">{doc.docNo}</TableCell>
                                <TableCell>{doc.vendorSnapshot.shortName}</TableCell>
                                <TableCell>{doc.invoiceNo}</TableCell>
                                <TableCell className="text-right">{doc.grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(doc.status)}>{doc.status}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onSelect={() => router.push(`/app/office/parts/purchases/new?editDocId=${doc.id}`)}>ดู/แก้ไข</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                           )) 
                        ) : (
                           <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">ไม่พบรายการ</TableCell>
                           </TableRow> 
                        )}
                    </TableBody>
                </Table>
                )}
            </CardContent>
        </Card>
      </Tabs>
    </>
  );
}
