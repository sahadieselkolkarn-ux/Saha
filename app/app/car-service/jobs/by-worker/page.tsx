"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { JobList } from "@/components/job-list";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2 } from "lucide-react";
import type { UserProfile } from "@/lib/types";

export default function CarServiceByWorkerPage() {
  const { db } = useFirebase();
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    const fetchWorkers = async () => {
      setLoading(true);
      const workersQuery = query(
        collection(db, "users"),
        where("department", "==", "CAR_SERVICE"),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const querySnapshot = await getDocs(workersQuery);
      const fetchedWorkers = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setWorkers(fetchedWorkers);
      setLoading(false);
    };

    fetchWorkers();
  }, [db]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  return (
    <>
      <PageHeader title="งานตามพนักงาน (Car Service)" description="ดูงานที่กำลังทำของพนักงานแต่ละคน" />
      {workers.length > 0 ? (
        <Accordion type="multiple" className="w-full space-y-4">
          {workers.map(worker => (
            <AccordionItem value={worker.uid} key={worker.uid} className="border rounded-lg">
              <AccordionTrigger className="px-6">
                <span className="font-semibold">{worker.displayName}</span>
              </AccordionTrigger>
              <AccordionContent className="p-6 pt-0">
                <JobList
                  department="CAR_SERVICE"
                  status="IN_PROGRESS"
                  assigneeUid={worker.uid}
                  emptyTitle="ไม่มีงานที่กำลังทำ"
                  emptyDescription={`${worker.displayName} ยังไม่มีงานที่รับผิดชอบในขณะนี้`}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <p>No workers found in Car Service department.</p>
      )}
    </>
  );
}
