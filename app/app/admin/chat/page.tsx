"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminChatPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app');
  }, [router]);
  return null;
}
