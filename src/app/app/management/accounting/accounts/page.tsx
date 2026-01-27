"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Loader2, PlusCircle, Search, MoreHorizontal, Edit, ToggleLeft, ToggleRight, BookOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { AccountingAccount } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";

export default function ManagementAccountingAccountsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<WithId<AccountingAccount>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [accountToAction, setAccountToAction] = useState<WithId<AccountingAccount> | null>(null);
  const [isDeactivateAlertOpen, setIsDeactivateAlertOpen] = useState(false);

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  useEffect(() => {
    if (!db) {
        // Firebase is not ready yet, keep loading
        return;
    }
    setLoading(true);
    const q = query(collection(db, "accountingAccounts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<AccountingAccount>)));
      setLoading(false);
    }, (error) => {
      console.error("Error loading accounting accounts: ", error);
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่มีสิทธิ์เข้าถึงข้อมูลบัญชี หรือการดึงข้อมูลถูกปฏิเสธ" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, toast]);

  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
      acc.name.toLowerCase().includes(lowercasedFilter) ||
      (acc.accountNo && acc.accountNo.includes(searchTerm))
    );
  }, [accounts, searchTerm]);

  const handleToggleActive = (account: WithId<AccountingAccount>) => {
    setAccountToAction(account);
    setIsDeactivateAlertOpen(true);
  };

  const confirmToggleActive = async () => {
    if (!db || !accountToAction) return;
    try {
      const accountRef = doc(db, "accountingAccounts", accountToAction.id);
      const newStatus = !accountToAction.isActive;
      await updateDoc(accountRef, {
        isActive: newStatus,
        updatedAt: serverTimestamp()
      });
      toast({ title: `เปลี่ยนสถานะบัญชีสำเร็จ` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
    } finally {
      setIsDeactivateAlertOpen(false);
      setAccountToAction(null);
    }
  };

  if (!profile) {
    return (
         <div className="flex justify-center items-center h-64">
            <Loader2 className="mx-auto animate-spin" />
         </div>
    )
  }

  if (!hasPermission) {
    return (
      <div className="w-full">
        <PageHeader title="บัญชีเงินสด/ธนาคาร" description="จัดการและดูข้อมูลบัญชีการเงิน" />
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                <CardDescription>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบหรือฝ่ายบริหารเท่านั้น</CardDescription>
            </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="บัญชีเงินสด/ธนาคาร" description="จัดการและดูข้อมูลบัญชีการเงิน">
        <Button asChild>
          <Link href="/app/management/accounting/accounts/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            เพิ่มบัญชี
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาจากชื่อบัญชี หรือ เลขที่บัญชี..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อบัญชี</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>ธนาคาร</TableHead>
                  <TableHead>เลขที่บัญชี</TableHead>
                  <TableHead>ยอดยกมา</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
                ) : filteredAccounts.length > 0 ? (
                  filteredAccounts.map(account => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell>{account.type}</TableCell>
                      <TableCell>{account.bankName || '-'}</TableCell>
                      <TableCell>{account.accountNo || '-'}</TableCell>
                      <TableCell className="text-right">{(account.openingBalance ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        <Badge variant={account.isActive ? 'default' : 'secondary'}>{account.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem asChild><Link href={`/app/management/accounting/accounts/${account.id}/ledger`}><BookOpen className="mr-2"/> ดูรายการเข้า-ออก</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href={`/app/management/accounting/accounts/${account.id}`}><Edit className="mr-2"/> แก้ไข</Link></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(account)}>
                              {account.isActive ? <ToggleLeft className="mr-2"/> : <ToggleRight className="mr-2"/>}
                              {account.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center">ยังไม่มีบัญชี กรุณากด ‘เพิ่มบัญชี’</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isDeactivateAlertOpen} onOpenChange={setIsDeactivateAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการเปลี่ยนสถานะ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการ {accountToAction?.isActive ? "ปิด" : "เปิด"} ใช้งานบัญชี "{accountToAction?.name}" ใช่หรือไม่?
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
