"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, OrderByDirection, QueryConstraint, FirestoreError } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';

interface JobTableListProps {
  department?: JobDepartment;
  status?: JobStatus;
  excludeStatus?: JobStatus | JobStatus[];
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

export function JobTableList({ 
  department, 
  status,
  excludeStatus,
  orderByField = "lastActivityAt",
  orderByDirection = "desc",
  emptyTitle = "No Jobs Found",
  emptyDescription = "There are no jobs that match the current criteria.",
  children
}: JobTableListProps) {
  const { db } = useFirebase();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  
  const [indexState, setIndexState] = useState<'ok' | 'missing' | 'building'>('ok');
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const jobsQuery = useMemo(() => {
    if (!db) return null;

    const constraints: QueryConstraint[] = [];
    if (department) {
      constraints.push(where('department', '==', department));
    }
    if (status) {
      constraints.push(where('status', '==', status));
    }
    
    constraints.push(orderBy(orderByField, orderByDirection));

    return query(collection(db, 'jobs'), ...constraints);
  }, [db, department, status, orderByField, orderByDirection, retry]);


  useEffect(() => {
    if (!jobsQuery) {
      setLoading(false);
      return;
    };

    setLoading(true);
    setError(null);
    setIndexState('ok');
    setIndexCreationUrl(null);

    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      if (excludeStatus) {
        const statusesToExclude = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
        jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
      }
      
      setJobs(jobsData);
      setLoading(false);
      setError(null);
      setIndexState('ok');
    }, (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [jobsQuery, excludeStatus]);

  useEffect(() => {
    if (error?.message?.includes('requires an index')) {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        setIndexCreationUrl(urlMatch[0]);
      }
      if (error.message.includes('currently building')) {
        setIndexState('building');
        const timer = setTimeout(() => setRetry(r => r + 1), 10000); // Poll every 10 seconds
        return () => clearTimeout(timer);
      } else {
        setIndexState('missing');
      }
    } else {
      setIndexState('ok');
      setIndexCreationUrl(null);
    }
  }, [error]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  
  if (indexState === 'building') {
    return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <CardTitle>ดัชนีกำลังถูกสร้าง (Index is Building)</CardTitle>
                <CardDescription className="max-w-xl mx-auto">
                    ฐานข้อมูลกำลังเตรียมพร้อมสำหรับการแสดงผลนี้ อาจใช้เวลา 2-3 นาที
                    หน้านี้จะพยายามโหลดข้อมูลใหม่โดยอัตโนมัติใน 10 วินาที
                </CardDescription>
            </CardHeader>
        </Card>
    );
  }
  
  if (indexState === 'missing') {
    return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <CardTitle>ต้องสร้างดัชนี (Index) ก่อน</CardTitle>
                <CardDescription className="max-w-xl mx-auto">
                    ฐานข้อมูลต้องการ Index เพื่อกรองและเรียงข้อมูล กรุณากดปุ่มด้านล่างเพื่อสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที)
                    เมื่อสร้างเสร็จแล้ว ให้กลับมารีเฟรชหน้านี้อีกครั้ง
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <a href={indexCreationUrl!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        เปิดหน้าสร้าง Index
                    </a>
                </Button>
            </CardContent>
        </Card>
    );
  }
  
  if (error) {
       return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <CardTitle>Error Loading Jobs</CardTitle>
                <CardDescription>{error.message}</CardDescription>
            </CardHeader>
        </Card>
       );
  }

  if (jobs.length === 0) {
     return (
        <Card>
            <CardContent className="pt-6 text-center text-muted-foreground h-48 flex flex-col justify-center items-center">
                <h3 className="font-semibold text-lg text-foreground">{emptyTitle}</h3>
                <p>{emptyDescription}</p>
                {children}
            </CardContent>
        </Card>
     );
  }

  return (
    <Card>
        <CardContent className="pt-6">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[200px]">Customer</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {jobs.map(job => (
                        <TableRow key={job.id}>
                            <TableCell className="font-medium">{job.customerSnapshot.name}</TableCell>
                            <TableCell>{job.department}</TableCell>
                            <TableCell className="max-w-xs truncate">{job.description}</TableCell>
                            <TableCell>
                                <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                            </TableCell>
                            <TableCell>{safeFormat(job.lastActivityAt, 'dd/MM/yy')}</TableCell>
                            <TableCell className="text-right">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/app/jobs/${job.id}`}>
                                        Details
                                    </Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
}
