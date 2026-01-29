"use client";

import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Copy, CopyCheck, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMediaQuery } from "@/hooks/use-media-query";

interface PayslipSlipDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  copyText?: string;
  copyJson?: string;
}

export function PayslipSlipDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footerActions,
  copyText,
  copyJson
}: PayslipSlipDrawerProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const handleCopy = async (textToCopy: string | undefined, format: 'Text' | 'JSON') => {
    if (!textToCopy) {
      toast({ variant: 'destructive', title: 'ไม่สามารถคัดลอกได้', description: 'ไม่มีข้อมูลให้คัดลอก' });
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({ title: 'คัดลอกแล้ว', description: `คัดลอกสลิปในรูปแบบ ${format} แล้ว` });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      toast({ variant: 'destructive', title: 'คัดลอกไม่สำเร็จ' });
    }
  };

  const DrawerHeader = () => (
    <div className="sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between shrink-0">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {copied ? <CopyCheck className="mr-2"/> : <Copy className="mr-2"/>}
              คัดลอก
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => handleCopy(copyText, 'Text')} disabled={!copyText}>คัดลอกเป็นข้อความ</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleCopy(copyJson, 'JSON')} disabled={!copyJson}>คัดลอกเป็น JSON</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X/></Button>
      </div>
    </div>
  );

  const DrawerFooter = () => (
    footerActions ? (
      <div className="border-t bg-background p-4 flex justify-end gap-2 shrink-0">
        {footerActions}
      </div>
    ) : null
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 flex flex-col h-[90dvh]">
          <DrawerHeader />
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-6">
              {children}
            </div>
          </ScrollArea>
          <DrawerFooter />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[100dvh] flex flex-col">
        <DrawerHeader />
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4">
            {children}
          </div>
        </ScrollArea>
        <DrawerFooter />
      </DrawerContent>
    </Drawer>
  );
}
