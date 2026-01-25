"use client";

import { useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from 'lucide-react';

function ReceivablesPayablesContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'creditors' ? 'creditors' : 'debtors';
  
  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="debtors">ลูกหนี้ (Debtors)</TabsTrigger>
        <TabsTrigger value="creditors">เจ้าหนี้ (Creditors)</TabsTrigger>
      </TabsList>
      <TabsContent value="debtors">
        <Card>
          <CardHeader>
            <CardTitle>ลูกหนี้การค้า</CardTitle>
            <CardDescription>
              ภาพรวมและจัดการลูกหนี้ทั้งหมดในระบบ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Coming Soon: Debtor management features will be implemented here.</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="creditors">
        <Card>
          <CardHeader>
            <CardTitle>เจ้าหนี้การค้า</CardTitle>
            <CardDescription>
              ภาพรวมและจัดการเจ้าหนี้ทั้งหมดในระบบ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Coming Soon: Creditor management features will be implemented here.</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}


export default function ReceivablesPayablesPage() {
  const { profile } = useAuth();
  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  if (!hasPermission) {
    return (
      <div className="w-full">
        <PageHeader title="ลูกหนี้/เจ้าหนี้" />
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
      <PageHeader title="ลูกหนี้/เจ้าหนี้" description="จัดการและติดตามข้อมูลลูกหนี้และเจ้าหนี้" />
      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
        <ReceivablesPayablesContent />
      </Suspense>
    </>
  );
}
