"use client";

import { useParams } from "next/navigation";
import { doc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Loader2 } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { useMemo } from "react";

export default function WorkerJobsPage() {
  const { workerId } = useParams();
  const { db } = useFirebase();

  const workerDocRef = useMemo(() => 
    db && workerId ? doc(db, "users", workerId as string) : null
  , [db, workerId]);

  const { data: worker, isLoading } = useDoc<UserProfile>(workerDocRef);

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!worker) {
    return <PageHeader title="Worker Not Found" description="Could not find the specified worker." />;
  }

  return (
    <>
      <PageHeader title={`งานของ ${worker.displayName}`} description={`งานทั้งหมดที่ ${worker.displayName} กำลังรับผิดชอบ`} />
      <JobList 
        department="CAR_SERVICE" 
        status="IN_PROGRESS"
        assigneeUid={worker.id}
        emptyTitle="ไม่มีงานที่กำลังทำ"
        emptyDescription={`${worker.displayName} ยังไม่มีงานที่รับผิดชอบในขณะนี้`}
      />
    </>
  );
}
