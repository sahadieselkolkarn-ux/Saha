
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Menu, User, Briefcase, Globe, Phone, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublicHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header 
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300 px-4 md:px-8",
        isScrolled 
          ? "h-16 bg-slate-900/90 backdrop-blur-md border-b border-white/10" 
          : "h-20 bg-transparent"
      )}
    >
      <div className="container mx-auto h-full flex items-center justify-between">
        <Logo className="scale-90" />

        <nav className="hidden md:flex items-center gap-1">
          <Button variant="ghost" asChild className="text-white hover:bg-white/10 hover:text-white font-medium">
            <Link href="/">หน้าแรก</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white font-medium gap-1">
                สินค้าและบริการ <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-slate-800 border-white/10 text-white">
              <DropdownMenuItem className="focus:bg-primary/20 focus:text-white">
                <Package className="mr-2 h-4 w-4" /> สินค้า
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-primary/20 focus:text-white">
                <Settings className="mr-2 h-4 w-4" /> งานบริการ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" asChild className="text-white hover:bg-white/10 hover:text-white font-medium">
            <Link href="#contact">ติดต่อเรา</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-4 border-primary text-primary hover:bg-primary hover:text-white font-bold gap-2 rounded-full">
                ลงชื่อเข้าใช้ <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-white/10 text-white">
              <DropdownMenuItem asChild className="focus:bg-primary/20 focus:text-white cursor-pointer py-3">
                <Link href="/login">
                  <Briefcase className="mr-2 h-4 w-4 text-primary" /> 
                  สำหรับพนักงาน (Staff)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="focus:bg-primary/20 focus:text-white cursor-pointer py-3">
                <User className="mr-2 h-4 w-4 text-blue-400" /> 
                สำหรับลูกค้า (Customer)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <Button variant="ghost" size="icon" className="md:hidden text-white">
          <Menu className="h-6 w-6" />
        </Button>
      </div>
    </header>
  );
}
