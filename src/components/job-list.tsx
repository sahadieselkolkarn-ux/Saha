"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, Timestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { format } from "date-fns";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus;
}

const getStatusVariant = (status: Job['status']) => {
  switch (status) {
    case 'RECEIVED': return 'secondary';
    case 'IN_PROGRESS': return 'default';
    case 'DONE': return 'outline';
    case 'CLOSED': return 'destructive';
    default: return 'outline';
  }
}

export function JobList({ department, status }: JobListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const jobsQuery = useMemo(() => {
    if (!db) return null;
    
    const constraints = [orderBy("lastActivityAt", "desc")];
    if (department) {
      constraints.push(where("department", "==", department));
    }
    if (status) {
      constraints.push(where("status", "==", status));
    }
    
    // The 'as any' is a concession to TypeScript's difficulty with dynamically built queries.
    // This is safe as long as the constraint values are of the correct type.
    return query(collection(db, "jobs"), ...constraints as any);

  }, [db, department, status]);

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

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  
  if (jobs.length === 0) {
     return (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>No Jobs Found</CardTitle>
                <CardDescription>There are no jobs that match the current criteria.</CardDescription>
            </CardHeader>
        </Card>
     );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {jobs.map(job => (
        <Card key={job.id} className="flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
              <Badge variant={getStatusVariant(job.status)} className="flex-shrink-0">{job.status}</Badge>
            </div>
            <CardDescription>
              Dept: {job.department} &bull; Last update: {job.lastActivityAt ? format((job.lastActivityAt as Timestamp).toDate(), 'PP') : 'N/A'}
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
  );
}
