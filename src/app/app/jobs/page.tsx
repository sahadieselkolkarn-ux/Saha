"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, PlusCircle } from "lucide-react";
import type { Job } from "@/lib/types";

export default function JobsPage() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === "ADMIN") {
      q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    } else if (profile.role === "MANAGER" || profile.role === "OFFICER") {
      q = query(
        collection(db, "jobs"),
        where("department", "==", profile.department),
        orderBy("createdAt", "desc")
      );
    } else {
      setLoading(false);
      return;
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);
  
  const getStatusVariant = (status: Job['status']) => {
    switch (status) {
      case 'RECEIVED': return 'secondary';
      case 'IN_PROGRESS': return 'default';
      case 'DONE': return 'outline';
      case 'CLOSED': return 'destructive';
      default: return 'outline';
    }
  }

  const isOfficeUser = profile?.role === 'ADMIN' || profile?.department === 'OFFICE';

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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map(job => (
            <Card key={job.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-bold">{job.customerSnapshot.name}</CardTitle>
                  <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                </div>
                <CardDescription>
                  {job.department} &bull; Job ID: {job.id.substring(0, 6)}...
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
