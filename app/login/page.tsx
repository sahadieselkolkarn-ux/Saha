
import { redirect } from "next/navigation";

// This route is a duplicate of /app/(auth)/login/page.tsx and causes build errors.
// Redirecting to the root to resolve the issue. The root will then redirect to the correct login page.
export default function LoginPage() {
  redirect("/");
}
