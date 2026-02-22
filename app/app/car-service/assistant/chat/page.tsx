"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, Send, Loader2, Sparkles, User, Settings, 
  Key, AlertCircle, Info, Database, ShieldCheck 
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { askCarRepairAI } from "@/ai/flows/car-repair-assistant-flow";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { GenAISettings } from "@/lib/types";

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export default function CarRepairAIChatPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `สวัสดีครับพี่ๆ ช่าง! ผม "น้องจอนห์" ผู้ช่วยวิเคราะห์อาการรถคู่ใจของพี่ๆ ครับ

วันนี้พี่เจอรถคันไหนอาการหนัก หรือเจอโค้ด DTC อะไรมา พิมพ์บอกจอนห์ได้เลยครับ จอนห์จะช่วยวิเคราะห์หาสาเหตุ พร้อมกับค้นหาบันทึกการซ่อมในร้านและคู่มือใน Drive ให้พี่ลุยงานต่อได้ทันทีครับ!`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [apiKeyInput, setNewApiKeyInput] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const aiSettingsRef = useMemo(() => (db ? doc(db, "settings", "ai") : null), [db]);
  const { data: aiSettings } = useDoc<GenAISettings>(aiSettingsRef);

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT';

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!aiSettings?.geminiApiKey) {
        toast({
            variant: "destructive",
            title: "ระบบ AI ยังไม่พร้อม",
            description: "กรุณาติดต่อแอดมินเพื่อตั้งค่า API Key ก่อนนะครับ"
        });
        if (isAdmin) setIsApiKeyDialogOpen(true);
        return;
    }

    const userMsg = inputValue.trim();
    setInputValue("");
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const result = await askCarRepairAI({ message: userMsg, history });
      
      setMessages(prev => [...prev, { role: 'model', content: result.answer, timestamp: new Date() }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: `ขอโทษทีครับพี่ ระบบผมขัดข้องนิดหน่อย: ${error.message}`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveApiKey = async () => {
    if (!db || !apiKeyInput.trim() || !profile) return;
    setIsSavingKey(true);
    try {
      await setDoc(doc(db, "settings", "ai"), {
        geminiApiKey: apiKeyInput.trim(),
        updatedAt: serverTimestamp(),
        updatedByUid: profile.uid,
        updatedByName: profile.displayName
      }, { merge: true });
      toast({ title: "บันทึก API Key สำเร็จแล้วครับพี่!" });
      setIsApiKeyDialogOpen(false);
      setNewApiKeyInput("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: e.message });
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] space-y-3">
      <PageHeader 
        title="สอบถามน้องจอนห์ (AI)" 
        description="ปรึกษาปัญหาทางเทคนิค วิเคราะห์อาการเสีย และค้นหาคู่มือจากคลังข้อมูลร้าน Sahadiesel"
      >
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">John is Online</span>
            </div>
            {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setIsApiKeyDialogOpen(true)}>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                </Button>
            )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
        {/* Chat Area */}
        <Card className="lg:col-span-3 overflow-hidden flex flex-col border-primary/20 shadow-lg bg-background/50 backdrop-blur-sm">
            <div className="p-2 bg-muted/30 border-b flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <Database className="h-3 w-3" /> แหล่งข้อมูล: ประวัติซ่อม & คู่มือร้าน
                </div>
                {!aiSettings?.geminiApiKey && (
                    <Badge variant="destructive" className="text-[8px] h-4">API KEY MISSING</Badge>
                )}
            </div>
            <ScrollArea className="flex-1 p-3 md:p-5" ref={scrollRef}>
            <div className="space-y-5 max-w-4xl mx-auto">
                {messages.map((m, i) => {
                const isAI = m.role === 'model';
                return (
                    <div key={i} className={cn("flex w-full gap-3", !isAI ? "flex-row-reverse" : "self-start")}>
                    <Avatar className={cn("h-8 w-8 shrink-0 border shadow-sm", isAI ? "bg-primary text-white" : "bg-muted")}>
                        {isAI ? (
                        <div className="bg-primary flex items-center justify-center w-full h-full text-white">
                            <Bot className="h-4 w-4" />
                        </div>
                        ) : (
                        <>
                            <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile?.displayName}`} />
                            <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                        </>
                        )}
                    </Avatar>
                    <div className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-all border",
                        !isAI 
                        ? "bg-primary text-primary-foreground border-primary rounded-tr-none" 
                        : "bg-white border-border rounded-tl-none text-foreground prose prose-sm dark:prose-invert"
                    )}>
                        <div className="whitespace-pre-wrap leading-relaxed">
                        {m.content}
                        </div>
                        <div className={cn(
                        "text-[10px] mt-1.5 opacity-50 font-medium",
                        !isAI ? "text-right" : "text-left"
                        )}>
                        {format(m.timestamp, 'HH:mm')}
                        </div>
                    </div>
                    </div>
                );
                })}
                
                {isLoading && (
                <div className="flex w-full gap-3">
                    <Avatar className="h-8 w-8 shrink-0 bg-primary text-white border shadow-sm">
                    <div className="bg-primary flex items-center justify-center w-full h-full text-white">
                        <Bot className="h-4 w-4 animate-bounce" />
                    </div>
                    </Avatar>
                    <div className="bg-white border rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-2 shadow-sm border-border">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground italic">จอนห์กำลังค้นหาในคลังความรู้ Sahadiesel...</span>
                    </div>
                </div>
                )}
            </div>
            </ScrollArea>

            <div className="p-3 bg-background border-t">
            <div className="flex gap-2 max-w-4xl mx-auto items-center">
                <Input 
                placeholder="พิมพ์อาการรถ หรือคำถามมาได้เลยครับพี่..." 
                className="rounded-full bg-muted/30 border-primary/20 h-10 px-5 focus-visible:ring-primary shadow-inner"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
                />
                <Button 
                size="icon" 
                className="rounded-full h-10 w-10 shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </div>
            </div>
        </Card>

        {/* Info Sidebar */}
        <div className="hidden lg:flex flex-col gap-4">
            <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold flex items-center gap-2 text-amber-800">
                        <Info className="h-3 w-3" /> คำแนะนำการใช้งาน
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-[11px] text-amber-700 space-y-2">
                    <p>• หากจอนห์ตอบไม่ถูก ให้พี่ไปบันทึกวิธีแก้ที่ถูกต้องในเมนู <b>"แชร์ประสบการณ์"</b> ครับ</p>
                    <p>• จอนห์จะใช้ข้อมูลที่พี่บันทึก มาตอบคำถามครั้งต่อไปทันที (Learning)</p>
                    <p>• จอนห์อ่านข้างในไฟล์ Drive ไม่ได้ แต่จะส่งลิงก์ที่เกี่ยวข้องให้พี่เปิดดูเองเพื่อความแม่นยำครับ</p>
                </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold flex items-center gap-2 text-primary">
                        <ShieldCheck className="h-3 w-3" /> ความปลอดภัยข้อมูล
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-[11px] text-muted-foreground">
                    ข้อมูลเทคนิคและบันทึกการซ่อมทั้งหมด เป็นความลับเฉพาะของร้าน Sahadiesel จะไม่ถูกนำไปเผยแพร่ที่อื่นครับ
                </CardContent>
            </Card>
        </div>
      </div>

      {/* API Key Dialog */}
      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> 
              ตั้งค่าสมองน้องจอนห์ (Paid API)
            </DialogTitle>
            <DialogDescription>
              ระบุ Gemini API Key ของร้านเพื่อให้ AI ทำงานได้เสถียรและแม่นยำขึ้น
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">Gemini API Key</Label>
              <Input 
                id="api-key" 
                type="password" 
                placeholder="ระบุ API Key ที่นี่..." 
                value={apiKeyInput}
                onChange={(e) => setNewApiKeyInput(e.target.value)}
              />
            </div>
            {aiSettings?.geminiApiKey && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-xs text-green-700 font-medium">
                <ShieldCheck className="h-4 w-4" /> ระบบเชื่อมต่อกับ Paid API เรียบร้อยแล้วครับพี่โจ้
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiKeyDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>
              {isSavingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึกกุญแจ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}