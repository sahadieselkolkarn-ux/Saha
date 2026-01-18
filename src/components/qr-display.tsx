import { cn } from '@/lib/utils';

interface QrDisplayProps {
  className?: string;
}

export function QrDisplay({ className }: QrDisplayProps) {
  // This is a static visual representation of a QR code.
  // The actual data it would encode is representational.
  return (
    <div className={cn('p-4 bg-white rounded-lg shadow-md inline-block', className)}>
      <svg width="256" height="256" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
        <path fill="white" d="M0 0h33v33H0z"/>
        <path fill="black" d="M4 4h7v7H4z M22 4h7v7h-7z M4 22h7v7H4z"/>
        <path fill="black" d="M6 6h3v3H6z M24 6h3v3h-3z M6 24h3v3H6z"/>
        <path fill="black" d="M13 4h1v1h-1z M15 4h1v1h-1z M17 4h1v1h-1z M19 4h1v1h-1z M4 13h1v1H4z M13 13h1v1h-1z M15 13h1v1h-1z M16 13h1v1h-1z M18 13h1v1h-1z M20 13h1v1h-1z M22 13h1v1h-1z M24 13h1v1h-1z M26 13h1v1h-1z M28 13h1v1h-1z M4 15h1v1H4z M13 15h1v1h-1z M20 15h1v1h-1z M28 15h1v1h-1z M4 16h1v1H4z M13 16h1v1h-1z M15 16h1v1h-1z M17 16h1v1h-1z M24 16h1v1h-1z M28 16h1v1h-1z M4 18h1v1H4z M15 18h1v1h-1z M18 18h1v1h-1z M22 18h1v1h-1z M24 18h1v1h-1z M4 20h1v1H4z M13 20h1v1h-1z M15 20h1v1h-1z M16 20h1v1h-1z M18 20h1v1h-1z M22 20h1v1h-1z M26 20h1v1h-1z M28 20h1v1h-1z M13 22h1v1h-1z M15 22h1v1h-1z M17 22h1v1h-1z M19 22h1v1h-1z M13 24h1v1h-1z M18 24h1v1h-1z M13 26h1v1h-1z M15 26h1v1h-1z M17 26h1v1h-1z M19 26h1v1h-1z M13 28h1v1h-1z M15 28h1v1h-1z M17 28h1v1h-1z M19 28h1v1h-1z"/>
      </svg>
    </div>
  );
}
