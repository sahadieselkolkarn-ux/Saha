"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMediaQuery } from "@/hooks/use-media-query";

interface PayslipSlipDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  onPrint?: () => void; // New prop for printing
}

export function PayslipSlipDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footerActions,
  onPrint
}: PayslipSlipDrawerProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const DrawerHeader = () => (
    <div className="sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between shrink-0">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {onPrint && (
          <Button variant="outline" size="sm" onClick={onPrint} className="gap-2">
            <Printer className="h-4 w-4" />
            พิมพ์สลิป
          </Button>
        )}
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
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="sr-only">{description}</DialogDescription>
          ) : null}
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
