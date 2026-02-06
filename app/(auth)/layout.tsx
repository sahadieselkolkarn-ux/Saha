"use client";

import { Logo } from "@/components/logo";
import Image from "next/image";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Find the login background image from our placeholder library
  const bgImage = PlaceHolderImages.find(img => img.id === "login-bg") || PlaceHolderImages[0];

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4 overflow-hidden">
      {/* Background Image Container */}
      <div className="absolute inset-0 z-0">
        <Image
          src={bgImage.imageUrl}
          alt={bgImage.description}
          fill
          priority
          className="object-cover"
          data-ai-hint={bgImage.imageHint}
        />
        {/* Dark Gradient Overlay for better contrast and a professional look */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/50 to-primary/30 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo with a Glassmorphism effect container */}
        <div className="mb-8 flex justify-center py-6 px-4 bg-background/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
            <Logo className="scale-110" />
        </div>
        
        {/* Auth Forms */}
        <div className="shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden">
            {children}
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-white/40 text-xs uppercase tracking-widest font-medium">
          Sahadiesel Service Management System
        </p>
      </div>
    </div>
  );
}