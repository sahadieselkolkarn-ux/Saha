"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter, FirestorePermissionError } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, PlusCircle } from "lucide-react";
import type { Job } from "@/lib/types";
import { format } from "date-fns";

export default function JobsPage() {
  const { profile, db } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !db) return;

    setLoading(true);
    let q;
    // Admins see all jobs
    if (profile.role === "ADMIN") {
      q = query(collection(db, "jobs"), orderBy("lastActivityAt", "desc"));
    } 
    // Managers and Officers see jobs in their department
    else if (profile.role === "MANAGER" || profile.role === "OFFICER") {
      q = query(
        collection(db, "jobs"),
        where("department", "==", profile.department),
        orderBy("lastActivityAt", "desc")
      );
    } 
    // Other roles don't see any jobs by default
    else {
      setJobs([]);
      setLoading(false);
      return;
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
      setLoading(false);
    }, (error) => {
        const permissionError = new FirestorePermissionError({ path: 'jobs', operation: 'list' });
        errorEmitter.emit('permission-error', permissionError);
        toast({ variant: "destructive", title: "Error loading jobs", description: "You may not have permission to view jobs." });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [profile, db, toast]);
  
  const getStatusVariant = (status: Job['status']) => {
    switch (status) {
      case 'RECEIVED': return 'secondary';
      case 'IN_PROGRESS': return 'default';
      case 'DONE': return 'outline';
      case 'CLOSED': return 'destructive';
      default: return 'outline';
    }
  }

  const isOfficeUser = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'OFFICE';

  return (
    <>
      <PageHeader title="Job List" description="View and manage all ongoing and past jobs.">
        {isOfficeUser && (
            <Button asChild>
                <Link href="/app/office/intake">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Job
                </Link>
            </Button>
        )}
      </PageHeader>
      
      {loading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>No Jobs Found</CardTitle>
                <CardDescription>There are no jobs to display for your department.</CardDescription>
            </CardHeader>
            {isOfficeUser && (
                <CardContent>
                    <Button asChild>
                        <Link href="/app/office/intake">Create the first job</Link>
                    </Button>
                </CardContent>
            )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {jobs.map(job => (
            <Card key={job.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
                  <Badge variant={getStatusVariant(job.status)} className="flex-shrink-0">{job.status}</Badge>
                </div>
                <CardDescription>
                  {job.department} &bull; Last update: {format((job.lastActivityAt as Timestamp).toDate(), 'PP')}
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
