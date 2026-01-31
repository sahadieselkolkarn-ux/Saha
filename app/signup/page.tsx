// This page has been deprecated to resolve a routing conflict.
// The canonical page is now located at /app/(auth)/signup/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedSignupPage() {
  redirect('/signup');
  return null;
}
