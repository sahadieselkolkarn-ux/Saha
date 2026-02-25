"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ManualUploadPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app');
  }, [router]);
  return null;
}
