
"use client";

import { Globe, Phone, MapPin, Facebook, LineChart } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400 py-12 border-t border-white/5" id="contact">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <h3 className="text-white font-bold text-lg">เกี่ยวกับเรา</h3>
            <p className="text-sm leading-relaxed">
              Sahadiesel Service Center ผู้เชี่ยวชาญด้านการซ่อมบำรุงรถยนต์และระบบปั๊มหัวฉีดคอมมอนเรล
              ด้วยประสบการณ์กว่า 20 ปี เรามุ่งมั่นส่งมอบบริการที่ดีที่สุดให้กับลูกค้าทุกท่าน
            </p>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-white font-bold text-lg">ติดต่อเรา</h3>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> 02-XXX-XXXX</p>
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> เขตภาษีเจริญ กรุงเทพมหานคร</p>
              <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> www.sahadiesel.com</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-white font-bold text-lg">ติดตามเรา</h3>
            <div className="flex gap-4">
              <div className="bg-slate-800 p-2 rounded-full hover:bg-primary hover:text-white transition-colors cursor-pointer"><Facebook className="h-5 w-5" /></div>
              <div className="bg-slate-800 p-2 rounded-full hover:bg-primary hover:text-white transition-colors cursor-pointer"><Globe className="h-5 w-5" /></div>
            </div>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/5 text-center text-xs">
          <p>© {new Date().getFullYear()} Sahadiesel Service Management System. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
