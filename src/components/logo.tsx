import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-xl font-bold text-foreground", className)}>
        <div className="bg-primary text-primary-foreground rounded-lg p-2">
            <Building2 className="size-6" />
        </div>
        <span className="font-headline">Thai Job Mgt.</span>
    </Link>
  );
}
