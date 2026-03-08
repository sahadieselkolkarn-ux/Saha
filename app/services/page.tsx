"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import Image from "next/image";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, Wrench, Gauge, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { LandingPageContent } from "@/app/page";

export const dynamic = 'force-dynamic';

export default function ServicesPage() {
  const { db } = useFirebase();
  const [content, setContent] = useState<LandingPageContent>({
    heroTitle: "SAHADIESEL SERVICE CENTER",
    heroDescription: "",
    buttonText: "ตรวจสอบสถานะรถ",
    servicesTitle: "งานบริการของเรา",
    s1Title: "Standard",
    s1Desc: "บริการมาตรฐานสากล ใส่ใจทุกขั้นตอนการตรวจเช็คและซ่อมบำรุง",
    s2Title: "Space",
    s2Desc: "ให้บริการบนพื้นที่กว้างขวาง รองรับรถได้มากกว่า 50 คันต่อวัน พร้อมห้องรับรองลูกค้า",
    s3Title: "Specialist",
    s3Desc: "ทีมช่างผู้เชี่ยวชาญเฉพาะทาง แก้ปัญหาได้ตรงจุด รวดเร็ว แม่นยำ ด้วยระบบวิเคราะห์อัจฉริยะ",
    s4Title: "Service",
    s4Desc: "ศูนย์บริการรถยนต์นำเข้าและปั๊มหัวฉีดแบบครบวงจร One Stop Service ครอบคลุมแบบ 360 องศา ดูแลรักษา ซ่อม ทำสี เคลมประกัน ครบจบในที่เดียว",
    footerAboutTitle: "เกี่ยวกับเรา",
    footerAboutDesc: "",
    footerContactTitle: "ติดต่อเรา",
    footerPhone: "02-XXX-XXXX",
    footerAddress: "เขตภาษีเจริญ กรุงเทพมหานคร",
    footerWebsite: "www.sahadiesel.com",
    footerFacebookUrl: "https://facebook.com/sahadiesel",
  });

  useEffect(() => {
    if (!db) return;
    const fetchContent = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "landingPage"));
        if (docSnap.exists()) {
          setContent(docSnap.data() as LandingPageContent);
        }
      } catch (e) {
        console.error("Failed to fetch landing page content:", e);
      }
    };
    fetchContent();
  }, [db]);

  const bgImage = PlaceHolderImages.find(img => img.id === "login-bg") || PlaceHolderImages[0];

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      <PublicHeader />

      {/* Shared Background */}
      <div className="fixed inset-0 z-0">
        <Image
          src={bgImage.imageUrl}
          alt={bgImage.description}
          fill
          priority
          className="object-cover"
          data-ai-hint="luxury workshop"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/70 to-primary/40 backdrop-blur-[3px]" />
      </div>

      <main className="relative z-10 flex-1 pt-24 pb-20">
        <section className="container mx-auto px-4">
          <div className="text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 font-headline tracking-tight">{content.servicesTitle}</h1>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">เรามุ่งมั่นส่งมอบบริการที่ดีที่สุดด้วยทีมช่างผู้เชี่ยวชาญและเครื่องมือที่ทันสมัย</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <Card className="bg-white/5 border-white/10 text-white backdrop-blur-sm group hover:bg-white/10 transition-all duration-500">
              <CardContent className="p-8 flex gap-6">
                <div className="bg-primary/20 p-4 rounded-2xl text-primary h-fit group-hover:bg-primary group-hover:text-white transition-colors"><ShieldCheck className="h-8 w-8" /></div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{content.s1Title}</h3>
                  <p className="text-slate-400 leading-relaxed">{content.s1Desc}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 text-white backdrop-blur-sm group hover:bg-white/10 transition-all duration-500">
              <CardContent className="p-8 flex gap-6">
                <div className="bg-primary/20 p-4 rounded-2xl text-primary h-fit group-hover:bg-primary group-hover:text-white transition-colors"><CheckCircle2 className="h-8 w-8" /></div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{content.s2Title}</h3>
                  <p className="text-slate-400 leading-relaxed">{content.s2Desc}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 text-white backdrop-blur-sm group hover:bg-white/10 transition-all duration-500">
              <CardContent className="p-8 flex gap-6">
                <div className="bg-primary/20 p-4 rounded-2xl text-primary h-fit group-hover:bg-primary group-hover:text-white transition-colors"><Wrench className="h-8 w-8" /></div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{content.s3Title}</h3>
                  <p className="text-slate-400 leading-relaxed">{content.s3Desc}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 text-white backdrop-blur-sm group hover:bg-white/10 transition-all duration-500">
              <CardContent className="p-8 flex gap-6">
                <div className="bg-primary/20 p-4 rounded-2xl text-primary h-fit group-hover:bg-primary group-hover:text-white transition-colors"><Gauge className="h-8 w-8" /></div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{content.s4Title}</h3>
                  <p className="text-slate-400 leading-relaxed">{content.s4Desc}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <Button size="lg" className="rounded-full px-12 h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/20" asChild>
              <Link href="/contact">
                นัดหมายรับบริการ <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter content={content} />
    </div>
  );
}
