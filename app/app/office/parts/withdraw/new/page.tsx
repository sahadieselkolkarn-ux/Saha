"use client";

import { PageHeader } from "@/components/page-header";
import PartWithdrawalForm from "@/components/part-withdrawal-form";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function NewWithdrawalPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="บันทึกการเบิกอะไหล่" 
        description="หักยอดสต็อกออกจากคลังเพื่อนำไปใช้งานในใบงานหรือบิลขาย" 
      />
      <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>}>
        <PartWithdrawalForm />
      </Suspense>
    </div>
  );
}
