"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, MoreHorizontal, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";
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

    const [documents, setDocuments] = useState<WithId<PurchaseDoc>[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("withTax");

    useEffect(() => {
        if (!db) return;
        setLoading(true);

        const q = query(collection(db, "purchaseDocs"), orderBy("docDate", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<PurchaseDoc>));
            setDocuments(docsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching purchase documents:", error);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาดในการโหลดข้อมูล" });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, toast]);

    const filteredDocuments = useMemo(() => {
        const withTaxFilter = activeTab === "withTax";
        let filtered = documents.filter(doc => doc.withTax === withTaxFilter);

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(doc =>
                doc.docNo.toLowerCase().includes(lowercasedTerm) ||
                doc.vendorSnapshot.companyName.toLowerCase().includes(lowercasedTerm) ||
                doc.vendorSnapshot.shortName.toLowerCase().includes(lowercasedTerm) ||
                doc.invoiceNo?.toLowerCase().includes(lowercasedTerm)
            );
        }
        return filtered;
    }, [documents, searchTerm, activeTab]);

    return (
        <>
            <PageHeader title="รายการซื้อ" description="จัดการเอกสารการจัดซื้อทั้งหมด">
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
                        <TabsTrigger value="withTax">มีภาษี (VAT)</TabsTrigger>
                        <TabsTrigger value="noTax">ไม่มีภาษี</TabsTrigger>
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
                            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin h-8 w-8" /></div>
                        ) : (
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>เลขที่เอกสาร</TableHead>
                                            <TableHead>วันที่</TableHead>
                                            <TableHead>ร้านค้า</TableHead>
                                            <TableHead>เลขที่บิล</TableHead>
                                            <TableHead>สถานะ</TableHead>
                                            <TableHead className="text-right">ยอดสุทธิ</TableHead>
                                            <TableHead className="text-right">จัดการ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDocuments.length > 0 ? filteredDocuments.map(docItem => (
                                            <TableRow key={docItem.id}>
                                                <TableCell className="font-medium">{docItem.docNo}</TableCell>
                                                <TableCell>{safeFormat(new Date(docItem.docDate), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{docItem.vendorSnapshot.shortName}</TableCell>
                                                <TableCell>{docItem.invoiceNo}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(docItem.status)}>{docItem.status}</Badge></TableCell>
                                                <TableCell className="text-right">{docItem.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem>
                                                                <Eye className="mr-2 h-4 w-4" /> ดู (เร็วๆ นี้)
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center">ไม่พบเอกสาร</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </Tabs>
        </>
    );
}
