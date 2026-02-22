"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, onSnapshot, query, orderBy, doc, deleteDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, Search, MoreHorizontal, Edit, Eye, Trash2, Filter } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Vendor } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";
import { vendorTypeLabel } from "@/lib/ui-labels";
import { VENDOR_TYPES } from "@/lib/constants";

function VendorsPageContent() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [vendors, setVendors] = useState<WithId<Vendor>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get('type') || "ALL");
  const [vendorToDelete, setVendorToDelete] = useState<WithId<Vendor> | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Management and Office can view
  const hasPermission = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.role === 'MANAGER' || profile.department === 'OFFICE' || profile.department === 'MANAGEMENT';
  }, [profile]);
  
  // Management and Office can add/edit (unless they are Viewers)
  const canEdit = useMemo(() => {
    if (!profile || profile.role === 'VIEWER') return false;
    return profile.role === 'ADMIN' || profile.role === 'MANAGER' || profile.department === 'OFFICE' || profile.department === 'MANAGEMENT';
  }, [profile]);

  const isAdmin = useMemo(() => profile?.role === 'ADMIN', [profile]);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const q = query(collection(db, "vendors"), orderBy("shortName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<Vendor>)));
      setLoading(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลร้านค้าได้", description: error.message });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const filteredVendors = useMemo(() => {
    let filtered = [...vendors];

    // Filter by type
    if (typeFilter !== "ALL") {
        filtered = filtered.filter(v => v.vendorType === typeFilter);
    }

    // Search by text
    if (searchTerm.trim()) {
        const lowercasedFilter = searchTerm.toLowerCase();
        filtered = filtered.filter(v =>
            v.shortName.toLowerCase().includes(lowercasedFilter) ||
            v.companyName.toLowerCase().includes(lowercasedFilter) ||
            (v.phone && v.phone.includes(searchTerm)) ||
            (v.contactName && v.contactName.toLowerCase().includes(lowercasedFilter))
        );
    }

    return filtered;
  }, [vendors, searchTerm, typeFilter]);

  const handleDeleteRequest = (vendor: WithId<Vendor>) => {
    setVendorToDelete(vendor);
    setIsDeleteAlertOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!db || !vendorToDelete) return;
    try {
      await deleteDoc(doc(db, "vendors", vendorToDelete.id));
      toast({ title: "ลบร้านค้าสำเร็จ" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "การลบล้มเหลว", description: error.message });
    } finally {
      setIsDeleteAlertOpen(false);
      setVendorToDelete(null);
    }
  };

  if (!hasPermission) {
    return (
      <div className="w-full">
        <PageHeader title="รายชื่อร้านค้า" description="จัดการข้อมูลร้านค้าและคู่ค้า" />
        <Card className="text-center py-12">
          <CardHeader>
            <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
            <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบ, ฝ่าย Office และฝ่ายบริหารเท่านั้น</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="รายชื่อร้านค้า" description="จัดการข้อมูลร้านค้า คู่ค้า และผู้รับเหมางานนอก">
        {canEdit && (
          <Button asChild>
            <Link href="/app/office/parts/vendors/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              เพิ่มร้านค้า/ผู้รับเหมา
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาจากชื่อย่อ, ชื่อร้าน, เบอร์โทร, หรือผู้ติดต่อ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-[200px]">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="ทุกประเภท" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">ทุกประเภท</SelectItem>
                        {VENDOR_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{vendorTypeLabel(type)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground px-1">ใช้กรองรายชื่อร้านตามประเภทงาน</p>
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อย่อ</TableHead>
                  <TableHead>ชื่อร้าน/บริษัท</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>เบอร์โทร</TableHead>
                  <TableHead>ผู้ติดต่อ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
                ) : filteredVendors.length > 0 ? (
                  filteredVendors.map(vendor => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.shortName}</TableCell>
                      <TableCell>{vendor.companyName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal whitespace-nowrap">
                            {vendorTypeLabel(vendor.vendorType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{vendor.phone || vendor.contactPhone || '-'}</TableCell>
                      <TableCell>{vendor.contactName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.isActive ? 'default' : 'secondary'}>{vendor.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild><Link href={`/app/office/parts/vendors/${vendor.id}?view=1`}><Eye className="mr-2 h-4 w-4"/> ดู</Link></DropdownMenuItem>
                            {canEdit && (
                                <DropdownMenuItem asChild><Link href={`/app/office/parts/vendors/${vendor.id}`}><Edit className="mr-2 h-4 w-4"/> แก้ไข</Link></DropdownMenuItem>
                            )}
                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleDeleteRequest(vendor)} className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4"/> ลบ
                                    </DropdownMenuItem>
                                </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">ไม่พบข้อมูลร้านค้าในหมวดที่เลือก</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบ "{vendorToDelete?.companyName}" ออกจากระบบใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">ยืนยันการลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function VendorsPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}>
            <VendorsPageContent />
        </Suspense>
    )
}
