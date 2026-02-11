"use client";

import { PageHeader } from "@/components/page-header";
import { ChatJimmy } from "@/components/chat-jimmy";
import { useAuth } from "@/context/auth-context";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, ShieldAlert, Heart } from "lucide-react";

export default function AdminChatPage() {
  const { profile } = useAuth();
  
  const isAllowed = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT';

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
            <CardDescription>หน้านี้สงวนไว้สำหรับผู้บริหารเท่านั้นค่ะ</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Chat with Nong Jimmy" 
        description="ปรึกษาน้องจิมมี่ ผู้ช่วยส่วนตัวคนเก่งเพื่อการบริหารจัดการร้านสหดีเซล" 
      >
        <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 rounded-full border border-pink-500/20 shadow-sm">
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
            </span>
            <span className="text-xs font-bold text-pink-600 flex items-center gap-1">
              JIMMY IS HERE <Heart className="h-3 w-3 fill-pink-600" />
            </span>
        </div>
      </PageHeader>
      
      <ChatJimmy />
    </div>
  );
}
