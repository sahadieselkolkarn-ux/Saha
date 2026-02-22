"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Send, Loader2, Wrench, Sparkles, AlertCircle } from "lucide-react";
import { askCarRepairAI } from "@/ai/flows/car-repair-assistant-flow";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export default function CarRepairAIChatPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `สวัสดีค่ะพี่ช่าง! มีรถอาการเป็นยังไง หรืออยากให้ช่วยค้นหาวิธีแก้ปัญหาอะไร บอกน้อง AI ได้เลยนะคะ น้องจะช่วยหาจากประวัติงานซ่อมในร้านและคู่มือให้ค่ะ`,
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
    if (!inputValue.trim() || isLoading) return;

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
        content: `ขออภัยค่ะพี่ช่าง ระบบ AI ขัดข้องชั่วคราว: ${error.message}`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(true); // Small delay feel
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] space-y-4">
      <PageHeader 
        title="สอบถาม AI ผู้ช่วยช่าง" 
        description="ปรึกษาปัญหาทางเทคนิค วิเคราะห์อาการเสีย และค้นหาประวัติการซ่อมด้วยพลัง AI"
      >
        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            <Sparkles className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">AI Analysis Mode</span>
        </div>
      </PageHeader>

      <Card className="flex-1 overflow-hidden flex flex-col border-primary/20 shadow-xl">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex w-full gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <Avatar className={cn("h-9 w-9 shrink-0", m.role === 'model' ? "bg-primary text-white" : "bg-muted")}>
                  {m.role === 'model' ? <Bot className="h-5 w-5" /> : <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile?.displayName}`} />}
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                  m.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted border rounded-tl-none"
                )}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  <div className="text-[9px] mt-2 opacity-50 text-right">{format(m.timestamp, 'HH:mm')}</div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex w-full gap-3">
                <Avatar className="h-9 w-9 shrink-0 bg-primary text-white"><Bot className="h-5 w-5 animate-bounce" /></Avatar>
                <div className="bg-muted border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground italic">กำลังวิเคราะห์ข้อมูลเคสเก่าและคู่มือให้นะคะ...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 bg-muted/20 border-t">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Input 
              placeholder="พิมพ์อาการรถ หรือยี่ห้อรุ่นที่สงสัย เช่น Isuzu Revo หัวฉีดมีปัญหา..." 
              className="rounded-full bg-background border-primary/20 h-12 px-6"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={isLoading}
            />
            <Button 
              size="icon" 
              className="rounded-full h-12 w-12 shrink-0 shadow-lg"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
