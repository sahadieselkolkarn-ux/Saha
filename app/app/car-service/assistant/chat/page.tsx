"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Send, Loader2, Sparkles, User } from "lucide-react";
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
      content: `สวัสดีครับพี่ๆ ช่าง! ผม "น้องจอนห์" ผู้ช่วยวิเคราะห์อาการรถคู่ใจของพี่ๆ ครับ มีรถคันไหนอาการหนักหรืออยากให้ช่วยค้นหาวิธีแก้ตรงไหน บอกจอนห์มาได้เลย เดี๋ยวจอนห์ช่วยหาข้อมูลในร้านและคู่มือให้ครับ ลุยเลยพี่!`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] space-y-3">
      <PageHeader 
        title="สอบถามน้องจอนห์ (AI)" 
        description="ปรึกษาปัญหาทางเทคนิค วิเคราะห์อาการเสีย และค้นหาประวัติการซ่อมกับน้องจอนห์"
      >
        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            <Sparkles className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">John is Online</span>
        </div>
      </PageHeader>

      <Card className="flex-1 overflow-hidden flex flex-col border-primary/20 shadow-lg bg-background/50 backdrop-blur-sm">
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
                  <span className="text-xs text-muted-foreground italic">จอนห์กำลังนึกอยู่ครับพี่...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 bg-background border-t">
          <div className="flex gap-2 max-w-4xl mx-auto items-center">
            <Input 
              placeholder="พิมพ์อาการรถมาได้เลยครับ..." 
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
    </div>
  );
}
