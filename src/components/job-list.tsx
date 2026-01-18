"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, OrderByDirection, QueryConstraint, FirestoreError, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, AlertCircle, ExternalLink, UserCheck } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  assigneeUid?: string;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
  emptyTitle?: string;
  emptyDescription?: string;
  children?: React.ReactNode;
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

export function JobList({ 
  department, 
  status,
  assigneeUid,
  orderByField = "lastActivityAt",
  orderByDirection = "desc",
  emptyTitle = "No Jobs Found",
  emptyDescription = "There are no jobs that match the current criteria.",
  children
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  const jobsQuery = useMemo(() => {
    if (!db) return null;
    
    const constraints: QueryConstraint[] = [];
    if (department) {
      constraints.push(where("department", "==", department));
    }
    if (status) {
        if (Array.isArray(status)) {
            constraints.push(where("status", "in", status));
        } else {
            constraints.push(where("status", "==", status));
        }
    }
    if (assigneeUid) {
        constraints.push(where("assigneeUid", "==", assigneeUid));
    }
    constraints.push(orderBy(orderByField, orderByDirection));
    
    return query(collection(db, "jobs"), ...constraints);

  }, [db, department, status, assigneeUid, orderByField, orderByDirection]);

  useEffect(() => {
    if (!jobsQuery) {
      setLoading(false);
      return;
    };

    setLoading(true);
    setError(null);
    setIndexCreationUrl(null);
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
      setLoading(false);
      setError(null);
      setIndexCreationUrl(null);
    }, (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [jobsQuery]);

  useEffect(() => {
    if (error?.message?.includes('requires an index')) {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        setIndexCreationUrl(urlMatch[0]);
      }
    } else {
      setIndexCreationUrl(null);
    }
  }, [error]);

  const handleAcceptJob = async (jobId: string) => {
    if (!db || !profile) {
      toast({ variant: "destructive", title: "Cannot accept job", description: "User not logged in." });
      return;
    };
    
    setIsAccepting(jobId);
    try {
      const jobDocRef = doc(db, "jobs", jobId);
      await updateDoc(jobDocRef, {
        status: "IN_PROGRESS",
        assigneeUid: profile.uid,
        assigneeName: profile.displayName,
        lastActivityAt: serverTimestamp(),
      });
      toast({ title: "Job Accepted", description: "The job is now assigned to you." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to accept job", description: error.message });
    } finally {
      setIsAccepting(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  
  if (indexCreationUrl) {
    return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <CardTitle>ต้องสร้างดัชนี (Index) ก่อน</CardTitle>
                <CardDescription className="max-w-xl mx-auto">
                    ฐานข้อมูลต้องการดัชนี (Index) เพื่อกรองและเรียงข้อมูลงานตามที่คุณต้องการ
                    กรุณากดปุ่มด้านล่างเพื่อเปิดหน้าสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที)
                    เมื่อสร้างเสร็จแล้ว ให้กลับมารีเฟรชหน้านี้อีกครั้ง
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        เปิดหน้าสร้าง Index
                    </a>
                </Button>
            </CardContent>
             <CardFooter className="flex-col items-center gap-2 pt-4">
                <p className="text-xs text-muted-foreground">Query details:</p>
                <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md max-w-full overflow-x-auto">
                    {department && `department: ${department}, `}
                    {status && `status: ${Array.isArray(status) ? `[${status.join(', ')}]` : status}, `}
                    {assigneeUid && `assigneeUid: ${assigneeUid}, `}
                    {`orderBy: ${orderByField} ${orderByDirection}`}
                </p>
            </CardFooter>
        </Card>
    );
  }

  if (jobs.length === 0) {
     return (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>{emptyTitle}</CardTitle>
                <CardDescription>{emptyDescription}</CardDescription>
            </CardHeader>
            {children && <CardContent>{children}</CardContent>}
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
              Dept: {job.department}
              {job.assigneeName && <span className="font-medium"> • {job.assigneeName}</span>}
              <br />
              Last update: {safeFormat(job.lastActivityAt, 'PP')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link href={`/app/jobs/${job.id}`}>
                View Details <ArrowRight className="ml-auto" />
              </Link>
            </Button>
            {job.status === 'RECEIVED' && (
              <Button 
                variant="default" 
                className="w-full"
                onClick={() => handleAcceptJob(job.id)}
                disabled={isAccepting !== null}
              >
                {isAccepting === job.id ? <Loader2 className="animate-spin" /> : <UserCheck className="mr-2" />}
                รับงาน
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
