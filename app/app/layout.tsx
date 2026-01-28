"use client";
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function RedirectLayout() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const newPath = pathname.substring(4); // Remove leading '/app'
    router.replace(newPath);
  }, [pathname, router]);

  return null; // Or a loading spinner
}
