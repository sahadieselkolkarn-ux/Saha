"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, OrderByDirection, QueryConstraint, FirestoreError, limit, doc, deleteDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, ExternalLink, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { JOB_STATUS_DISPLAY } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface JobTableListProps {
  department?: JobDepartment;
  status?: JobStatus;
  excludeStatus?: JobStatus | JobStatus[];
  searchTerm?: string;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
  limit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  children?: React.ReactNode;
}

const getStatusVariant = (status: Job['status']) => {
  switch (status) {
    case 'RECEIVED':
    case 'WAITING_QUOTATION':
    case 'WAITING_APPROVE':
      return 'secondary';
    case 'IN_PROGRESS':
    case 'IN_REPAIR_PROCESS':
      return 'default';
    case 'DONE':
    case 'WAITING_CUSTOMER_PICKUP':
      return 'outline';
    case 'CLOSED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function JobTableList({ 
  department, 
  status,
  excludeStatus,
  searchTerm = "",
  orderByField = "lastActivityAt",
  orderByDirection = "desc",
  limit: limitProp,
  emptyTitle = "No Jobs Found",
  emptyDescription = "There are no jobs that match the current criteria.",
  children
}: JobTableListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  
  const [indexState, setIndexState] = useState<'ok' | 'missing' | 'building'>('ok');
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  const isUserAdmin = profile?.role === 'ADMIN';

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

    if (limitProp) {
      constraints.push(limit(limitProp));
    }

    return query(collection(db, 'jobs'), ...constraints);
  }, [db, department, status, orderByField, orderByDirection, retry, limitProp]);


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
  
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) {
      return jobs;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return jobs.filter(job =>
      job.customerSnapshot.name.toLowerCase().includes(lowercasedFilter) ||
      job.customerSnapshot.phone.includes(searchTerm) ||
      job.description.toLowerCase().includes(lowercasedFilter) ||
      job.id.toLowerCase().includes(lowercasedFilter)
    );
  }, [jobs, searchTerm]);


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

  const handleDeleteRequest = (jobId: string) => {
    setJobToDelete(jobId);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !jobToDelete) return;
    
    try {
      await deleteDoc(doc(db, "jobs", jobToDelete));
      toast({title: "Job deleted successfully"});
    } catch (error: any) {
      toast({variant: "destructive", title: "Deletion Failed", description: error.message});
    } finally {
      setIsDeleteAlertOpen(false);
      setJobToDelete(null);
    }
  };

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

  if (filteredJobs.length === 0) {
     return (
        <Card>
            <CardContent className="pt-6 text-center text-muted-foreground h-48 flex flex-col justify-center items-center">
                <h3 className="font-semibold text-lg text-foreground">{searchTerm ? 'No jobs match your search' : emptyTitle}</h3>
                <p>{searchTerm ? 'Try a different search term.' : emptyDescription}</p>
                {children}
            </CardContent>
        </Card>
     );
  }

  return (
    <>
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
                      {filteredJobs.map(job => (
                          <TableRow key={job.id}>
                              <TableCell className="font-medium">{job.customerSnapshot.name}</TableCell>
                              <TableCell>{job.department}</TableCell>
                              <TableCell className="max-w-xs truncate">{job.description}</TableCell>
                              <TableCell>
                                  <Badge variant={getStatusVariant(job.status)}>{JOB_STATUS_DISPLAY[job.status]}</Badge>
                              </TableCell>
                              <TableCell>{safeFormat(job.lastActivityAt, 'dd/MM/yy')}</TableCell>
                              <TableCell className="text-right">
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" className="h-8 w-8 p-0">
                                              <span className="sr-only">Open menu</span>
                                              <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                          <DropdownMenuItem asChild>
                                              <Link href={`/app/jobs/${job.id}`}>Details</Link>
                                          </DropdownMenuItem>
                                          {isUserAdmin && (
                                              <>
                                                  <DropdownMenuItem asChild>
                                                      <Link href={`/app/jobs/${job.id}?edit=true`}><Edit className="mr-2 h-4 w-4" />Edit</Link>
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                      className="text-destructive focus:text-destructive"
                                                      onSelect={() => handleDeleteRequest(job.id)}
                                                  >
                                                      <Trash2 className="mr-2 h-4 w-4" />Delete
                                                  </DropdownMenuItem>
                                              </>
                                          )}
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
       <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete this job and all its related activities. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
