"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Job } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';

export default function OfficeJobsPendingPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  
  const jobsQuery = useMemo(() => {
      if (!db) return null;
      return query(
          collection(db, "jobs"), 
          where("status", "==", "RECEIVED"),
          orderBy("createdAt", "desc")
      );
  }, [db]);

  useEffect(() => {
    if (!jobsQuery) {
      setLoading(false);
      return;
    };

    setLoading(true);
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
      setLoading(false);
    }, (error) => {
        toast({ variant: "destructive", title: "Error loading jobs", description: "Could not retrieve jobs from the database." });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [jobsQuery, toast]);

  return (
    <>
      <PageHeader title="งานรอดำเนินการ" description="รายการงานที่รับเข้ามาและรอส่งต่อให้แผนกซ่อม" />
      
      {loading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>No Pending Jobs</CardTitle>
                <CardDescription>There are no jobs awaiting action.</CardDescription>
            </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {jobs.map(job => (
            <Card key={job.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
                  <Badge variant="secondary" className="flex-shrink-0">{job.status}</Badge>
                </div>
                <CardDescription>
                  To: {job.department} &bull; Created: {safeFormat(job.createdAt, 'PP')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/app/jobs/${job.id}`}>
                    View Details <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
