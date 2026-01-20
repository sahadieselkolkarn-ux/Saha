import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
      <div className="flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <PageHeader
          title="404 - Page Not Found"
          description="Sorry, the page you are looking for could not be found."
        />
        <Button asChild>
          <Link href="/">Return to Homepage</Link>
        </Button>
      </div>
    </div>
  );
}
