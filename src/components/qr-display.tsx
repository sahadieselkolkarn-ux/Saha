'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface QrDisplayProps {
  className?: string;
  data: string | null; // The string to encode in the QR code
}

export function QrDisplay({ className, data }: QrDisplayProps) {
  const qrCodeUrl = data
    ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data)}`
    : null;

  return (
    <div className={cn('p-4 bg-white rounded-lg shadow-md inline-block', className)}>
      {qrCodeUrl ? (
        <Image
          src={qrCodeUrl}
          alt="QR Code"
          width={256}
          height={256}
          priority
          key={data} // Add key to force re-render when data changes
        />
      ) : (
        <Skeleton className="w-[256px] h-[256px]" />
      )}
    </div>
  );
}
