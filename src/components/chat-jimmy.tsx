"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getCountFromServer } from "firebase/firestore";
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
  AlertCircle, ChevronRight, BarChart3, Users as UsersIcon, CheckCircle2 
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
      content: `สวัสดีค่ะพี่โจ้! น้องจิมมี่พร้อมช่วยพี่โจ้ดูแลร้านสหดีเซลแล้วค่ะ วันนี้พี่โจ้อยากให้น้องจิมมี่ช่วยเช็คยอดขาย คุมงบค่าแรงพนักงาน หรืออยากจะปรึกษาเรื่องฟื้นฟูร้านตรงไหน บอกน้องจิมมี่ได้เลยนะคะ น้องจิมมี่เป็นกำลังใจให้พี่โจ้เสมอค่ะ!`,
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
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, isLoading]);

  const fetchContext = async () => {
    if (!db) return {};
    
    try {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);

      // 1. Fetch Sales (Cashbook Receipts)
      // Note: If this fails due to missing index, we return 0 rather than crashing
      let totalSales = 0;
      try {
        const salesQuery = query(
          collection(db, "accountingEntries"),
          where("entryType", "in", ["RECEIPT", "CASH_IN"]),
          where("entryDate", ">=", format(start, "yyyy-MM-dd")),
          where("entryDate", "<=", format(end, "yyyy-MM-dd"))
        );
        const salesSnap = await getDocs(salesQuery);
        totalSales = salesSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      } catch (indexError) {
        console.warn("Sales query failed (likely index missing), falling back to 0.");
      }

      // 2. Fetch Workers
      let workerNames: string[] = [];
      try {
        const workersQuery = query(
          collection(db, "users"),
          where("role", "==", "WORKER"),
          where("status", "==", "ACTIVE")
        );
        const workersSnap = await getDocs(workersQuery);
        workerNames = workersSnap.docs.map(d => d.data().displayName);
      } catch (e) {
        console.warn("Workers fetch error:", e);
      }

      // 3. Fetch Active Jobs
      let jobsCount = 0;
      try {
        const jobsQuery = query(
          collection(db, "jobs"),
          where("status", "in", ["IN_PROGRESS", "IN_REPAIR_PROCESS", "PENDING_PARTS"])
        );
        const jobsCountSnap = await getCountFromServer(jobsQuery);
        jobsCount = jobsCountSnap.data().count;
      } catch (e) {
        console.warn("Jobs count error:", e);
      }

      return {
        currentMonthSales: totalSales,
        workerCount: workerNames.length,
        workerNames: workerNames,
        activeJobsCount: jobsCount
      };
    } catch (e) {
      console.error("General context fetch error:", e);
      return {};
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!aiSettings?.geminiApiKey) {
        toast({
            variant: "destructive",
            title: "จิมมี่ยังไม่พร้อม",
            description: "กรุณาตั้งค่า API Key ก่อนนะคะ กดที่รูปฟันเฟืองด้านบนได้เลยค่ะ"
        });
        setIsApiKeyDialogOpen(true);
        return;
    }

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
        history: history.slice(0, -1),
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
        description: "เกิดข้อผิดพลาดในการเชื่อมต่อ AI กรุณาลองใหม่อีกครั้งนะคะ"
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
      toast({ title: "บันทึก API Key สำเร็จแล้วค่ะ" });
      setIsApiKeyDialogOpen(false);
      setNewApiKeyInput("");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "บันทึกไม่สำเร็จ", description: e.message });
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto border rounded-xl overflow-hidden bg-background shadow-2xl border-primary/20">
      {/* Header */}
      <div className="bg-primary p-4 flex items-center justify-between text-primary-foreground shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-full ring-2 ring-white/30">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-none flex items-center gap-2">
              น้องจิมมี่ <Badge variant="secondary" className="bg-pink-500/80 text-white text-[10px] h-4 border-none">Assistant</Badge>
            </h3>
            <p className="text-xs text-primary-foreground/70 mt-1">ผู้ช่วยคนเก่งของพี่โจ้แห่งสหดีเซล</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aiSettings?.geminiApiKey && (
            <Badge variant="outline" className="bg-green-500/20 text-green-100 border-green-500/30 gap-1.5 hidden sm:flex">
              <CheckCircle2 className="h-3 w-3" /> AI Ready
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsApiKeyDialogOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stats Quick View (Context Preview) */}
      <div className="bg-muted/30 border-b p-2 flex gap-4 overflow-x-auto text-[10px] uppercase font-bold tracking-widest text-muted-foreground whitespace-nowrap">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border shadow-sm text-primary">
            <BarChart3 className="h-3 w-3" /> วิเคราะห์งบพี่โจ้
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1">
            <UsersIcon className="h-3 w-3" /> ดูแลพี่ๆ ช่าง
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 text-pink-500">
            <Sparkles className="h-3 w-3" /> เป็นกำลังใจให้พี่โจ้ค่ะ
          </div>
      </div>

      {/* Chat Window */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex w-full gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <Avatar className={cn("h-9 w-9 shrink-0", m.role === 'model' ? "ring-2 ring-primary/20" : "ring-2 ring-muted")}>
                {m.role === 'model' ? (
                  <div className="bg-primary flex items-center justify-center w-full h-full text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                ) : (
                  <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile?.displayName}`} />
                )}
                <AvatarFallback>{m.role === 'model' ? "JM" : "PJ"}</AvatarFallback>
              </Avatar>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all",
                m.role === 'user' 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-muted border rounded-tl-none prose prose-sm dark:prose-invert max-w-none"
              )}>
                <div className="whitespace-pre-wrap leading-relaxed">
                    {/* Simplified Markdown handling */}
                    {m.content.split('\n').map((line, idx) => (
                        <p key={idx} className={line.startsWith('|') ? 'font-mono text-xs overflow-x-auto whitespace-pre' : ''}>
                            {line}
                        </p>
                    ))}
                </div>
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
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white ring-2 ring-primary/20 shrink-0">
                <Bot className="h-5 w-5 animate-bounce" />
              </div>
              <div className="bg-muted border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground italic">น้องจิมมี่กำลังวิเคราะห์ข้อมูลให้พี่โจ้อยู่นะคะ...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-muted/20 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input 
            placeholder="พิมพ์บอกน้องจิมมี่ได้เลยค่ะพี่โจ้..." 
            className="rounded-full bg-background border-primary/20 focus-visible:ring-primary h-12 px-6 shadow-inner"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <Button 
            size="icon" 
            className="rounded-full h-12 w-12 shrink-0 shadow-lg hover:scale-105 active:scale-95 transition-transform"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        <p className="text-[9px] text-center text-muted-foreground mt-3 uppercase font-bold tracking-tighter">
          SAHADIESEL INTELLIGENT COMPANION • ALWAYS BY YOUR SIDE P'JOE
        </p>
      </div>

      {/* API Key Dialog */}
      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> 
              ตั้งค่าสมองของน้องจิมมี่
            </DialogTitle>
            <DialogDescription>
              น้องจิมมี่ใช้ Gemini AI ในการช่วยพี่โจ้ทำงานนะคะ รบกวนพี่โจ้กรอก API Key ตรงนี้ก่อนน้า
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">Gemini API Key</Label>
              <Input 
                id="api-key" 
                type="password" 
                placeholder="วาง Key ของพี่โจ้ตรงนี้เลยค่ะ..." 
                value={apiKeyInput}
                onChange={(e) => setNewApiKeyInput(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                พี่โจ้สามารถขอ Key ได้ฟรีที่ <a href="https://aistudio.google.com/" target="_blank" className="text-primary underline">Google AI Studio</a> นะคะ
              </p>
            </div>
            {aiSettings?.geminiApiKey ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-xs text-green-700 font-medium">
                <CheckCircle2 className="h-4 w-4" /> น้องจิมมี่พร้อมลุยแล้วค่ะ มี Key อยู่แล้ว!
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2 text-xs text-amber-700 font-medium">
                <AlertCircle className="h-4 w-4" /> ยังไม่ได้ระบุ API Key ค่ะ
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiKeyDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>
              {isSavingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึกเลยค่ะ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
