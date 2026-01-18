'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface QrDisplayProps {
  className?: string;
  path?: string;
}

export function QrDisplay({ className, path = '/app/scan' }: QrDisplayProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    // This code runs only on the client side, after hydration, to get the full URL.
    const fullUrl = `${window.location.origin}${path}`;
    // We use an external API to generate the QR code image from the URL.
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(
      fullUrl
    )}`;
    setQrCodeUrl(qrApiUrl);
  }, [path]);

  return (
    <div className={cn('p-4 bg-white rounded-lg shadow-md inline-block', className)}>
      {qrCodeUrl ? (
        <Image
          src={qrCodeUrl}
          alt={`QR Code for ${path}`}
          width={256}
          height={256}
          priority
        />
      ) : (
        <Skeleton className="w-[256px] h-[256px]" />
      )}
    </div>
  );
}
