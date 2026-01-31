// This page has been deprecated to resolve a routing conflict.
// The canonical page is now located at /app/(auth)/login/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedLoginPage() {
  redirect('/login');
  return null;
}
