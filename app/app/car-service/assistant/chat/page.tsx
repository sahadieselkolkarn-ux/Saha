"use client";

import { useState, useRef, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, getDocs, limit, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, Send, Loader2, Sparkles, User, 
  Database, Info, CheckCircle2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export default function CarRepairAIChatPage() {
  const { db, app: firebaseApp } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `สวัสดีค่ะพี่ๆ ช่าง! จิมมี่มารับหน้าที่ดูแลการวิเคราะห์อาการรถให้แล้วนะคะ

วันนี้พี่เจอรถคันไหนอาการหนัก หรือเจอโค้ด DTC อะไรมา พิมพ์บอกจิมมี่ได้เลยค่ะ จิมมี่จะช่วยวิเคราะห์สาเหตุ พร้อมกับค้นหาบันทึกการซ่อมในร้านและคู่มือให้พี่ลุยงานต่อได้ทันทีเลยค่ะ!`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !db || !firebaseApp) return;

    const userMsg = inputValue.trim();
    setInputValue("");
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      // 1. Fetch Context from Client-side
      const [expSnap, manualsSnap] = await Promise.all([
        getDocs(query(collection(db, "carRepairExperiences"), orderBy("createdAt", "desc"), limit(20))),
        getDocs(collection(db, "carRepairManuals"))
      ]);
      
      const experiences = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const manuals = manualsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Call Jimmy AI via Cloud Function
      const functions = getFunctions(firebaseApp, 'us-central1');
      const chatWithJimmy = httpsCallable(functions, 'chatWithJimmy');
      
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const result = await chatWithJimmy({ 
        message: userMsg, 
        scope: 'TECHNICAL',
        history,
        contextData: { experiences, manuals }
      });
      
      const data = result.data as any;
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: data?.answer || "ขอโทษทีค่ะพี่ จิมมี่ประมวลผลขัดข้อง รบกวนลองอีกรอบนะคะ", 
        timestamp: new Date() 
      }]);
    } catch (error: any) {
      console.error("Jimmy Error:", error);
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: `ขอโทษทีค่ะพี่ ระบบจิมมี่ขัดข้อง: ${error.message || "Unknown Error"}`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] space-y-3">
      <PageHeader 
        title="สอบถามน้องจิมมี่ (AI ช่างเทคนิค)" 
        description="ปรึกษาปัญหาทางเทคนิค วิเคราะห์อาการเสีย และค้นหาคู่มือจากคลังข้อมูลร้าน Sahadiesel"
      >
        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            <Sparkles className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Jimmy is Online</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
        <Card className="lg:col-span-3 overflow-hidden flex flex-col border-primary/20 shadow-lg bg-background/50 backdrop-blur-sm">
            <div className="p-2 bg-muted/30 border-b flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <Database className="h-3 w-3" /> แหล่งข้อมูล: ประวัติซ่อม & คู่มือร้าน
                </div>
                <Badge variant="outline" className="text-[8px] h-4 border-green-200 text-green-600 bg-green-50">SYSTEM AI CONNECTED</Badge>
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
                    <div className="bg-primary flex items-center justify-center w-full h-full text-white"><Bot className="h-4 w-4 animate-bounce" /></div>
                    </Avatar>
                    <div className="bg-white border rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-2 shadow-sm border-border">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground italic font-medium">จิมมี่กำลังวิเคราะห์อาการและค้นหาข้อมูลอ้างอิงให้ค่ะพี่...</span>
                    </div>
                </div>
                )}
            </div>
            </ScrollArea>

            <div className="p-3 bg-background border-t shadow-inner">
            <div className="flex gap-2 max-w-4xl mx-auto items-center">
                <Input 
                placeholder="พิมพ์อาการรถ หรือรหัส DTC มาได้เลยค่ะพี่..." 
                className="rounded-full bg-muted/30 border-primary/20 h-10 px-5 focus-visible:ring-primary shadow-inner"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
                />
                <Button size="icon" className="rounded-full h-10 w-10 shrink-0 shadow-md transition-transform hover:scale-105" onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
                  <Send className="h-4 w-4" />
                </Button>
            </div>
            </div>
        </Card>

        <div className="hidden lg:flex flex-col gap-4">
            <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-bold flex items-center gap-2 text-amber-800"><Info className="h-3 w-3" /> คำแนะนำการใช้งาน</CardTitle></CardHeader>
                <CardContent className="text-[11px] text-amber-700 space-y-2">
                    <p>• จิมมี่สามารถตอบรหัส DTC ได้ทันที</p>
                    <p>• หากจิมมี่ตอบไม่ถูก ให้พี่ไปบันทึกวิธีแก้ที่ถูกต้องในเมนู <b>"แชร์ประสบการณ์"</b> ค่ะ</p>
                    <p>• จิมมี่จะเรียนรู้ข้อมูลนั้นมาตอบคำถามครั้งต่อไปทันที</p>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
