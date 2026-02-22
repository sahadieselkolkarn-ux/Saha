"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { doc, setDoc, serverTimestamp, collection, query, getDocs, limit, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Send, Bot, Loader2, Sparkles, Settings, Key, 
  AlertCircle, BarChart3, Users as UsersIcon, CheckCircle2, ShieldCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDoc } from "@/firebase/firestore/use-doc";
import { askJimmy } from "@/ai/flows/jimmy-ai-flow";
import type { GenAISettings } from "@/lib/types";

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
      content: `สวัสดีค่ะพี่โจ้! น้องจิมมี่พร้อมช่วยพี่โจ้ดูแลร้านสหดีเซลแบบเต็มตัวแล้วค่ะ ตอนนี้น้องจิมมี่สามารถประมวลผลข้อมูลบัญชีและงานซ่อมที่พี่ดึงมาให้ดูได้แล้วนะคะ พี่โจ้อยากรู้อะไรพิมพ์ถามน้องจิมมี่ได้เลยนะคะ!`,
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

  // Pre-fill API Key when dialog opens
  useEffect(() => {
    if (isApiKeyDialogOpen && aiSettings?.geminiApiKey) {
      setNewApiKeyInput(aiSettings.geminiApiKey);
    }
  }, [isApiKeyDialogOpen, aiSettings]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !db) return;

    if (!aiSettings?.geminiApiKey) {
        toast({ variant: "destructive", title: "จิมมี่ยังไม่พร้อม", description: "กรุณาติดต่อแอดมินเพื่อตั้งค่า API Key ก่อนนะคะ" });
        setIsApiKeyDialogOpen(true);
        return;
    }

    const userMessage = inputValue.trim();
    setInputValue("");
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      // 1. Fetch Management Summary from Client-side
      const [jobsSnap, entriesSnap] = await Promise.all([
        getDocs(query(collection(db, "jobs"), limit(50))),
        getDocs(query(collection(db, "accountingEntries"), orderBy("entryDate", "desc"), limit(30)))
      ]);

      const businessSummary = {
        activeJobs: jobsSnap.docs.filter(d => d.data().status !== 'CLOSED').map(d => ({
            id: d.id, customer: d.data().customerSnapshot?.name, status: d.data().status, dept: d.data().department
        })),
        recentTransactions: entriesSnap.docs.map(d => ({
            date: d.data().entryDate, amount: d.data().amount, type: d.data().entryType, desc: d.data().description
        }))
      };

      // 2. Call Jimmy AI
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const result = await askJimmy({ 
        message: userMessage, 
        scope: 'MANAGEMENT',
        apiKey: aiSettings.geminiApiKey,
        history,
        contextData: { businessSummary }
      });
      
      setMessages(prev => [...prev, { role: 'model', content: result.answer, timestamp: new Date() }]);
    } catch (error: any) {
      toast({ variant: "destructive", title: "จิมมี่ขัดข้อง", description: error.message });
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
    } catch (e: any) {
      toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: e.message });
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto border rounded-xl overflow-hidden bg-background shadow-2xl border-primary/20">
      <div className="bg-primary p-4 flex items-center justify-between text-primary-foreground shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-full ring-2 ring-white/30"><Bot className="h-6 w-6" /></div>
          <div>
            <h3 className="font-bold text-lg leading-none flex items-center gap-2">น้องจิมมี่ <Badge variant="secondary" className="bg-pink-500/80 text-white text-[10px] h-4">Manager Assistant</Badge></h3>
            <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-primary-foreground/70">ผู้ช่วยคนเก่งประจำโต๊ะทำงานพี่โจ้</p>
                {aiSettings?.geminiApiKey && (
                    <Badge variant="outline" className="text-[8px] h-3 border-white/40 text-white bg-white/10">API KEY CONFIGURED</Badge>
                )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsApiKeyDialogOpen(true)}><Settings className="h-5 w-5" /></Button>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex w-full gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <Avatar className={cn("h-9 w-9 shrink-0", m.role === 'model' ? "ring-2 ring-primary/20" : "ring-2 ring-muted")}>
                {m.role === 'model' ? <div className="bg-primary flex items-center justify-center w-full h-full text-white"><Bot className="h-5 w-5" /></div> : <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile?.displayName}`} />}
                <AvatarFallback>JM</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all", m.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted border rounded-tl-none prose prose-sm dark:prose-invert")}>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                <div className={cn("text-[10px] mt-2 opacity-50", m.role === 'user' ? "text-right" : "text-left")}>{format(m.timestamp, 'HH:mm')}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex w-full gap-3">
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shrink-0"><Bot className="h-5 w-5 animate-bounce" /></div>
              <div className="bg-muted border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground italic">น้องจิมมี่กำลังรวบรวมข้อมูลหลังบ้านมาวิเคราะห์ให้พี่โจ้อยู่นะคะ...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 bg-muted/20 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input placeholder="พิมพ์ถามน้องจิมมี่ได้ทุกเรื่องเลยค่ะ..." className="rounded-full bg-background border-primary/20 h-12 px-6 shadow-inner" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} />
          <Button size="icon" className="rounded-full h-12 w-12 shrink-0 shadow-lg" onClick={handleSend} disabled={!inputValue.trim() || isLoading}><Send className="h-5 w-5" /></Button>
        </div>
      </div>

      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> ตั้งค่าสมองของน้องจิมมี่</DialogTitle></DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="api-key">Gemini API Key</Label>
            <Input id="api-key" type="password" placeholder="ระบุ API Key ที่นี่..." value={apiKeyInput} onChange={(e) => setNewApiKeyInput(e.target.value)} />
            {aiSettings?.geminiApiKey && (
                <p className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> บันทึกไว้แล้ว: {aiSettings.geminiApiKey.substring(0, 8)}...
                </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiKeyDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>{isSavingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
