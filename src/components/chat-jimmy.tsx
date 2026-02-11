"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useFirebase } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Send, Bot, Loader2, Sparkles, Settings, Key, 
  AlertCircle, BarChart3, Users as UsersIcon, CheckCircle2 
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDoc } from "@/firebase/firestore/use-doc";
import type { GenAISettings } from "@/lib/types";

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export function ChatJimmy() {
  const { db, firebaseApp } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `สวัสดีค่ะพี่โจ้! น้องจิมมี่พร้อมช่วยพี่โจ้ดูแลร้านสหดีเซลแบบเต็มตัวแล้วค่ะ ตอนนี้น้องจิมมี่สามารถเข้าไปดูระบบบัญชี งานซ่อม และข้อมูลพี่ๆ ช่างได้เองแล้ว พี่โจ้อยากรู้อะไร หรืออยากให้ช่วยคำนวณงบตรงไหน บอกน้องจิมมี่ได้เลยนะคะ!`,
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

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !firebaseApp) return;

    if (!aiSettings?.geminiApiKey) {
        toast({
            variant: "destructive",
            title: "จิมมี่ยังไม่พร้อม",
            description: "กรุณาตั้งค่า API Key ก่อนนะคะ"
        });
        setIsApiKeyDialogOpen(true);
        return;
    }

    const userMessage = inputValue.trim();
    setInputValue("");
    
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date() }
    ]);
    setIsLoading(true);

    try {
      // Call Cloud Function instead of Server Action
      const functions = getFunctions(firebaseApp, 'us-central1');
      const chatFn = httpsCallable(functions, "chatWithJimmy");
      
      const result = await chatFn({ message: userMessage });
      const data = result.data as { answer: string };

      setMessages(prev => [
        ...prev,
        { role: 'model', content: data.answer, timestamp: new Date() }
      ]);
    } catch (error: any) {
      console.error("Chat Error:", error);
      toast({
        variant: "destructive",
        title: "จิมมี่มีอาการสับสนเล็กน้อย",
        description: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ AI"
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
      toast({ variant: "destructive", title: "ไม่สามารถบันทึกได้", description: e.message });
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
              น้องจิมมี่ <Badge variant="secondary" className="bg-pink-500/80 text-white text-[10px] h-4 border-none">Deep Analysis</Badge>
            </h3>
            <p className="text-xs text-primary-foreground/70 mt-1">ผู้ช่วยที่เห็นทุกอย่างใน Sahadiesel</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsApiKeyDialogOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Capabilities */}
      <div className="bg-muted/30 border-b p-2 flex gap-4 overflow-x-auto text-[10px] uppercase font-bold tracking-widest text-muted-foreground whitespace-nowrap scrollbar-hide">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border shadow-sm text-primary">
            <BarChart3 className="h-3 w-3" /> วิเคราะห์รายรับ-จ่าย
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border shadow-sm text-primary">
            <Bot className="h-3 w-3" /> ตรวจสอบสถานะงาน
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border shadow-sm text-primary">
            <Sparkles className="h-3 w-3" /> คุมงบค่าแรง
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
                <div className="whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {m.content}
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
                <span className="text-xs text-muted-foreground italic">น้องจิมมี่กำลังขอข้อมูลจากระบบและวิเคราะห์อยู่นะคะ...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-muted/20 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input 
            placeholder="พิมพ์ถามน้องจิมมี่ได้ทุกเรื่องเลยค่ะ..." 
            className="rounded-full bg-background border-primary/20 focus-visible:ring-primary h-12 px-6 shadow-inner"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={inputValue.trim() === "" || isLoading}
          />
          <Button 
            size="icon" 
            className="rounded-full h-12 w-12 shrink-0 shadow-lg hover:scale-105 active:scale-95 transition-transform"
            onClick={handleSend}
            disabled={inputValue.trim() === "" || isLoading}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
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
              กรุณาระบุ Gemini API Key เพื่อเปิดใช้งานระบบวิเคราะห์อัจฉริยะ
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
                <CheckCircle2 className="h-4 w-4" /> ระบบพร้อมใช้งานแล้วค่ะ!
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiKeyDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>
              {isSavingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
