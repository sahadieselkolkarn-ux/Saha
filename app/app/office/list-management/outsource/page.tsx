"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, Search, MoreHorizontal, Edit, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { OutsourceVendor } from "@/lib/types";
import { WithId } from "@/firebase/firestore/use-collection";

export default function OutsourceVendorsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [vendors, setVendors] = useState<WithId<OutsourceVendor>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorToAction, setVendorToAction] = useState<WithId<OutsourceVendor> | null>(null);
  const [isToggleActiveAlertOpen, setIsToggleActiveAlertOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const hasPermission = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'ADMIN' || profile.department === 'OFFICE' || profile.department === 'MANAGEMENT';
  }, [profile]);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const q = query(collection(db, "outsourceVendors"), orderBy("shopName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<OutsourceVendor>)));
      setLoading(false);
    }, (error) => {
      toast({ variant: "destructive", title: "ไม่สามารถโหลดข้อมูลผู้รับเหมาได้", description: error.message });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const filteredVendors = useMemo(() => {
    if (!searchTerm.trim()) return vendors;
    const lowercasedFilter = searchTerm.toLowerCase();
    return vendors.filter(v =>
      v.shopName.toLowerCase().includes(lowercasedFilter) ||
      (v.contactName && v.contactName.toLowerCase().includes(lowercasedFilter)) ||
      (v.phone && v.phone.includes(searchTerm))
    );
  }, [vendors, searchTerm]);

  const handleToggleActive = (vendor: WithId<OutsourceVendor>) => {
    setVendorToAction(vendor);
    setIsToggleActiveAlertOpen(true);
  };
  
  const handleDelete = (vendor: WithId<OutsourceVendor>) => {
    setVendorToAction(vendor);
    setIsDeleteAlertOpen(true);
  };

  const confirmToggleActive = async () => {
    if (!db || !vendorToAction) return;
    try {
      const vendorRef = doc(db, "outsourceVendors", vendorToAction.id);
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
  
  const confirmDelete = async () => {
    if (!db || !vendorToAction) return;
    try {
      await deleteDoc(doc(db, "outsourceVendors", vendorToAction.id));
      toast({ title: "ลบรายชื่อสำเร็จ" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    } finally {
        setIsDeleteAlertOpen(false);
        setVendorToAction(null);
    }
  };


  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!hasPermission) {
    return (
      <div className="w-full">
        <PageHeader title="จัดการรายชื่อผู้รับเหมา/งานนอก" />
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
      <PageHeader title="จัดการรายชื่อผู้รับเหมา/งานนอก" description="จัดการข้อมูลร้านค้าและอู่สำหรับส่งต่องานนอก">
        <Button asChild>
          <Link href="/app/office/list-management/outsource/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            เพิ่มรายชื่อผู้รับเหมา
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาจากชื่อร้าน/อู่, ผู้ติดต่อ, หรือเบอร์โทร..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อร้าน/อู่</TableHead>
                  <TableHead>ผู้ติดต่อ</TableHead>
                  <TableHead>เบอร์โทร</TableHead>
                  <TableHead>สถานที่</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.length > 0 ? (
                  filteredVendors.map(vendor => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.shopName}</TableCell>
                      <TableCell>{vendor.contactName || '-'}</TableCell>
                      <TableCell>{vendor.phone || '-'}</TableCell>
                      <TableCell>{vendor.location || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.isActive ? 'default' : 'secondary'}>{vendor.isActive ? 'ใช้งาน' : 'ไม่ใช้งาน'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem asChild><Link href={`/app/office/list-management/outsource/${vendor.id}`}><Edit className="mr-2"/> ดู/แก้ไข</Link></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(vendor)}>
                              {vendor.isActive ? <ToggleLeft className="mr-2"/> : <ToggleRight className="mr-2"/>}
                              {vendor.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(vendor)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2"/> ลบ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">ไม่พบข้อมูลผู้รับเหมา/งานนอก</TableCell></TableRow>
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
              คุณต้องการ {vendorToAction?.isActive ? "ปิด" : "เปิด"} ใช้งาน "{vendorToAction?.shopName}" ใช่หรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleActive}>ยืนยัน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบ "{vendorToAction?.shopName}" ออกจากระบบใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
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
