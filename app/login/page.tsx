
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    try {
      await signIn(email.trim(), pass);
      router.replace("/management");
    } catch (e:any) {
      toast({ variant: "destructive", title: "เข้าสู่ระบบไม่สำเร็จ", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 border rounded-lg p-6 bg-white">
        <h1 className="text-xl font-semibold">เข้าสู่ระบบ</h1>
        <Input placeholder="อีเมล" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <Input placeholder="รหัสผ่าน" type="password" value={pass} onChange={(e)=>setPass(e.target.value)} />
        <Button className="w-full" onClick={onSubmit} disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </Button>
      </div>
    </div>
  );
}
