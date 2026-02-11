"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getCountFromServer, Timestamp } from "firebase/firestore";
import { chatJimmy, type ChatJimmyInput } from "@/ai/flows/chat-jimmy-flow";
import { useToast } from "@/hooks/use-toast";
import { startOfMonth, endOfMonth, format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Send, Bot, User, Loader2, Sparkles, Settings, Key, 
  AlertCircle, ChevronRight, BarChart3, Users as UsersIcon 
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { UserProfile, AccountingEntry, Job, GenAISettings } from "@/lib/types";
import { useDoc } from "@/firebase/firestore/use-doc";

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export function ChatJimmy() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `สวัสดีครับคุณ ${profile?.displayName || 'ผู้บริหาร'}! ผม "จิมมี่" ผู้ช่วย AI ประจำ Sahadiesel ยินดีที่ได้พบครับ มีข้อมูลส่วนไหนที่คุณอยากให้ผมช่วยวิเคราะห์หรือตรวจสอบไหมครับ?`,
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const fetchContext = async () => {
    if (!db) return {};
    
    try {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);

      // 1. Fetch Sales (Cashbook Receipts)
      const salesQuery = query(
        collection(db, "accountingEntries"),
        where("entryType", "in", ["RECEIPT", "CASH_IN"]),
        where("entryDate", ">=", format(start, "yyyy-MM-dd")),
        where("entryDate", "<=", format(end, "yyyy-MM-dd"))
      );
      const salesSnap = await getDocs(salesQuery);
      const totalSales = salesSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);

      // 2. Fetch Workers
      const workersQuery = query(
        collection(db, "users"),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const workersSnap = await getDocs(workersQuery);
      const workerNames = workersSnap.docs.map(d => d.data().displayName);

      // 3. Fetch Active Jobs
      const jobsQuery = query(
        collection(db, "jobs"),
        where("status", "in", ["IN_PROGRESS", "IN_REPAIR_PROCESS", "PENDING_PARTS"])
      );
      const jobsCount = await getCountFromServer(jobsQuery);

      return {
        currentMonthSales: totalSales,
        workerCount: workerNames.length,
        workerNames: workerNames,
        activeJobsCount: jobsCount.data().count
      };
    } catch (e) {
      console.error("Context fetch error:", e);
      return {};
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage, timestamp: new Date() }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const context = await fetchContext();
      
      const history = newMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const input: ChatJimmyInput = {
        message: userMessage,
        history: history.slice(0, -1), // Everything except the current message
        context: context
      };

      const { response } = await chatJimmy(input);

      setMessages(prev => [
        ...prev,
        { role: 'model', content: response, timestamp: new Date() }
      ]);
    } catch (error: any) {
      console.error("Chat error:", error);
      toast({
        variant: "destructive",
        title: "จิมมี่มีอาการสับสนเล็กน้อย",
        description: "เกิดข้อผิดพลาดในการเรียก AI กรุณาตรวจสอบ API Key หรือลองอีกครั้งภายหลัง"
      });
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
      toast({ title: "บันทึก API Key สำเร็จ" });
      setIsApiKeyDialogOpen(false);
      setNewApiKeyInput("");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "บันทึกไม่สำเร็จ", description: e.message });
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto border rounded-xl overflow-hidden bg-background shadow-2xl">
      {/* Header */}
      <div className="bg-primary p-4 flex items-center justify-between text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-full ring-2 ring-white/30">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-none flex items-center gap-2">
              Jimmy <Badge variant="secondary" className="bg-white/20 text-[10px] h-4">Beta</Badge>
            </h3>
            <p className="text-xs text-primary-foreground/70 mt-1">Sahadiesel Intelligent Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsApiKeyDialogOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stats Quick View (Context Preview) */}
      <div className="bg-muted/30 border-b p-2 flex gap-4 overflow-x-auto text-[10px] uppercase font-bold tracking-widest text-muted-foreground whitespace-nowrap">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border shadow-sm">
            <BarChart3 className="h-3 w-3 text-primary" /> สรุปข้อมูลธุรกิจ Real-time
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1">
            <UsersIcon className="h-3 w-3" /> ช่างพร้อมให้บริการ
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1">
            <Sparkles className="h-3 w-3" /> ระบบ Gemini 2.5 Flash
          </div>
      </div>

      {/* Chat Window */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex w-full gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <Avatar className={cn("h-9 w-9 shrink-0", m.role === 'model' ? "ring-2 ring-primary/20" : "ring-2 ring-muted")}>
                {m.role === 'model' ? (
                  <AvatarImage src="/jimmy-avatar.png" />
                ) : (
                  <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile?.displayName}`} />
                )}
                <AvatarFallback className={m.role === 'model' ? "bg-primary text-white" : "bg-muted"}>
                  {m.role === 'model' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                m.role === 'user' 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-muted border rounded-tl-none"
              )}>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                <div className={cn(
                  "text-[10px] mt-2 opacity-50",
                  m.role === 'user' ? "text-right" : "text-left"
                )}>
                  {format(m.timestamp, 'HH:mm')}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex w-full gap-3">
              <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary text-white">
                  <Bot className="h-5 w-5 animate-bounce" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground italic">จิมมี่กำลังคิด...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-muted/20 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input 
            placeholder="พิมพ์คำถามของคุณถึงจิมมี่ที่นี่..." 
            className="rounded-full bg-background border-primary/20 focus-visible:ring-primary h-12 px-6"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <Button 
            size="icon" 
            className="rounded-full h-12 w-12 shrink-0 shadow-lg"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-tighter">
          * จิมมี่เป็น AI ข้อมูลทางการเงินอาจมีความคลาดเคลื่อน กรุณาตรวจสอบกับสมุดบัญชีจริงอีกครั้ง
        </p>
      </div>

      {/* API Key Dialog */}
      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> 
              ตั้งค่า AI API Key
            </DialogTitle>
            <DialogDescription>
              ระบบใช้ Gemini AI ในการวิเคราะห์ข้อมูล กรุณากรอก Google AI API Key ของคุณ
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">Gemini API Key</Label>
              <Input 
                id="api-key" 
                type="password" 
                placeholder="กรอก Key ของคุณที่นี่..." 
                value={apiKeyInput}
                onChange={(e) => setNewApiKeyInput(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                คุณสามารถขอ API Key ได้ฟรีที่ <a href="https://aistudio.google.com/" target="_blank" className="text-primary underline">Google AI Studio</a>
              </p>
            </div>
            {aiSettings?.geminiApiKey && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-xs text-green-700">
                <CheckCircle className="h-4 w-4" /> ระบบมี API Key บันทึกอยู่แล้ว
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiKeyDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>
              {isSavingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึกการตั้งค่า
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={cn("lucide lucide-check-circle", className)} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
  );
}
