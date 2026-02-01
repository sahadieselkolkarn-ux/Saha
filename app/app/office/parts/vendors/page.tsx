
"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, Search, MoreHorizontal, Edit, ToggleLeft, ToggleRight, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Vendor } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";

export default function VendorsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [vendors, setVendors] = useState<WithId<Vendor>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorToAction, setVendorToAction] = useState<WithId<Vendor> | null>(null);
  const [isToggleActiveAlertOpen, setIsToggleActiveAlertOpen] = useState(false);

  const hasPermission = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.department === 'OFFICE' || profile.department === 'MANAGEMENT';
  }, [profile]);
  
  const isManagerOrAdmin = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.role === 'MANAGER';
  }, [profile]);

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
    if (!searchTerm.trim()) return vendors;
    const lowercasedFilter = searchTerm.toLowerCase();
    return vendors.filter(v =>
      v.shortName.toLowerCase().includes(lowercasedFilter) ||
      v.companyName.toLowerCase().includes(lowercasedFilter) ||
      (v.phone && v.phone.includes(searchTerm)) ||
      (v.contactName && v.contactName.toLowerCase().includes(lowercasedFilter))
    );
  }, [vendors, searchTerm]);

  const handleToggleActive = (vendor: WithId<Vendor>) => {
    setVendorToAction(vendor);
    setIsToggleActiveAlertOpen(true);
  };

  const confirmToggleActive = async () => {
    if (!db || !vendorToAction) return;
    try {
      const vendorRef = doc(db, "vendors", vendorToAction.id);
      const newStatus = !vendorToAction.isActive;
      await updateDoc(vendorRef, {
        isActive: newStatus,
        updatedAt: serverTimestamp()
      });
      toast({ title: `เปลี่ยนสถานะสำเร็จ` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    } finally {
      setIsToggleActiveAlertOpen(false);
      setVendorToAction(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

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
      <PageHeader title="รายชื่อร้านค้า" description="จัดการข้อมูลร้านค้าและคู่ค้า">
        <Button asChild>
          <Link href="/app/office/parts/vendors/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            เพิ่มร้านค้า
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาจากชื่อย่อ, ชื่อร้าน, เบอร์โทร, หรือผู้ติดต่อ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อย่อ</TableHead>
                  <TableHead>ชื่อร้าน/บริษัท</TableHead>
                  <TableHead>เบอร์โทรผู้ติดต่อ</TableHead>
                  <TableHead>ผู้ติดต่อ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.length > 0 ? (
                  filteredVendors.map(vendor => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.shortName}</TableCell>
                      <TableCell>{vendor.companyName}</TableCell>
                      <TableCell>{vendor.contactPhone || '-'}</TableCell>
                      <TableCell>{vendor.contactName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.isActive ? 'default' : 'secondary'}>{vendor.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem asChild><Link href={`/app/office/parts/vendors/${vendor.id}`}><Eye className="mr-2"/> ดู</Link></DropdownMenuItem>
                            {isManagerOrAdmin && (
                                <DropdownMenuItem asChild><Link href={`/app/office/parts/vendors/${vendor.id}`}><Edit className="mr-2"/> แก้ไข</Link></DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleToggleActive(vendor)}>
                              {vendor.isActive ? <ToggleLeft className="mr-2"/> : <ToggleRight className="mr-2"/>}
                              {vendor.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">ไม่พบข้อมูลร้านค้า</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isToggleActiveAlertOpen} onOpenChange={setIsToggleActiveAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการเปลี่ยนสถานะ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการ {vendorToAction?.isActive ? "ปิด" : "เปิด"} ใช้งานร้านค้า "{vendorToAction?.companyName}" ใช่หรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleActive}>ยืนยัน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
