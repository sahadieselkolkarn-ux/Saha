"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, orderBy, OrderByDirection, QueryConstraint, FirestoreError, doc, updateDoc, serverTimestamp, writeBatch, limit, getDocs, runTransaction, getDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, AlertCircle, ExternalLink, UserCheck, FileImage, Receipt } from "lucide-react";
import type { Job, JobStatus, JobDepartment, UserProfile } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { JOB_STATUS_DISPLAY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  excludeStatus?: JobStatus | JobStatus[];
  assigneeUid?: string;
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

export function JobList({ 
  department, 
  status,
  excludeStatus,
  assigneeUid,
  orderByField = "lastActivityAt",
  orderByDirection = "desc",
  limit: limitProp,
  emptyTitle = "No Jobs Found",
  emptyDescription = "There are no jobs that match the current criteria.",
  children
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  
  const [indexState, setIndexState] = useState<'ok' | 'missing' | 'building'>('ok');
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [billingJob, setBillingJob] = useState<Job | null>(null);
  
  const isOfficer = profile?.role === 'OFFICER';
  const [assigningJob, setAssigningJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);


  const jobsQuery = useMemo(() => {
    if (!db) return null;

    const constraints: QueryConstraint[] = [];
    if (department) {
      constraints.push(where('department', '==', department));
    }
    if (status && !Array.isArray(status)) {
      constraints.push(where('status', '==', status));
    }
    if (assigneeUid) {
      constraints.push(where('assigneeUid', '==', assigneeUid));
    }
    constraints.push(orderBy(orderByField, orderByDirection));

    if (limitProp) {
      constraints.push(limit(limitProp));
    }

    return query(collection(db, 'jobs'), ...constraints);
  }, [db, department, Array.isArray(status) ? null : status, assigneeUid, orderByField, orderByDirection, retry, limitProp]);


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
      
      if (status && Array.isArray(status)) {
        jobsData = jobsData.filter(job => status.includes(job.status));
      }
      
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
  }, [jobsQuery, status, excludeStatus]);

  useEffect(() => {
    if (error?.message?.includes('requires an index')) {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        setIndexCreationUrl(urlMatch[0]);
      }
      if (error.message.includes('currently building')) {
        setIndexState('building');
        const timer = setTimeout(() => setRetry(r => r + 1), 10000); 
        return () => clearTimeout(timer);
      } else {
        setIndexState('missing');
      }
    } else {
      setIndexState('ok');
      setIndexCreationUrl(null);
    }
  }, [error]);

  const handleAcceptJob = async (jobId: string) => {
    if (!db || !profile) {
      toast({ variant: "destructive", title: "ไม่สามารถรับงานได้", description: "ไม่พบข้อมูลผู้ใช้" });
      return;
    };
    
    setIsAccepting(jobId);
    try {
        const jobDocRef = doc(db, "jobs", jobId);
        
        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบงานที่ต้องการรับ");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("ไม่สามารถรับงานได้ เพราะสถานะเปลี่ยนไปแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกผู้อื่นรับไปแล้ว");
            }
            
            if (profile.department !== jobData.department) {
                throw new Error("คุณไม่ได้อยู่ในแผนกที่รับผิดชอบงานนี้");
            }

            transaction.update(jobDocRef, {
                status: "IN_PROGRESS",
                assigneeUid: profile.uid,
                assigneeName: profile.displayName,
                lastActivityAt: serverTimestamp(),
            });

            const activityDocRef = doc(collection(db, "jobs", jobId, "activities"));
            transaction.set(activityDocRef, {
                text: `รับงานเข้าดำเนินการ`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        });

        toast({ title: "รับงานสำเร็จ", description: "งานนี้ถูกมอบหมายให้คุณแล้ว" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "การรับงานล้มเหลว", description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };

  const openAssignDialog = async (job: Job) => {
    if (!db) return;
    setAssigningJob(job);
    setSelectedWorkerId(null);
    setIsFetchingWorkers(true);
    try {
      const workersQuery = query(
        collection(db, "users"),
        where("department", "==", job.department),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const querySnapshot = await getDocs(workersQuery);
      const fetchedWorkers = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setWorkers(fetchedWorkers);
    } catch (error) {
        toast({ variant: 'destructive', title: 'Could not fetch workers' });
        setWorkers([]);
    } finally {
        setIsFetchingWorkers(false);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!db || !profile || !assigningJob || !selectedWorkerId) return;
    
    const selectedWorker = workers.find(w => w.uid === selectedWorkerId);
    if (!selectedWorker) {
        toast({ variant: "destructive", title: "ไม่พบพนักงาน" });
        return;
    }

    setIsAccepting(assigningJob.id);
    try {
        const jobDocRef = doc(db, "jobs", assigningJob.id);

        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบงานที่ต้องการมอบหมาย");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("ไม่สามารถมอบหมายงานได้ เพราะสถานะเปลี่ยนไปแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกผู้อื่นรับไปแล้ว");
            }

            transaction.update(jobDocRef, {
                status: "IN_PROGRESS",
                assigneeUid: selectedWorker.uid,
                assigneeName: selectedWorker.displayName,
                lastActivityAt: serverTimestamp(),
            });

            const activityDocRef = doc(collection(db, "jobs", assigningJob.id, "activities"));
            transaction.set(activityDocRef, {
                text: `มอบหมายงานให้ ${selectedWorker.displayName}`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        });

        toast({ title: "มอบหมายงานสำเร็จ", description: `งานได้ถูกมอบหมายให้ ${selectedWorker.displayName}` });
        setAssigningJob(null);
    } catch (error: any) {
        toast({ variant: "destructive", title: "การมอบหมายงานล้มเหลว", description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };

  const handleBillingClick = (job: Job) => {
    if (job.customerSnapshot.useTax === true) {
      setBillingJob(job);
    } else {
      router.push(`/app/office/documents/delivery-note/new?jobId=${job.id}`);
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
                    หน้านี้จะพยายามโหลดข้อมูลใหม่โดยอัตโนมัติใน 10 วินาที หรือคุณสามารถลองรีเฟรชหน้านี้อีกครั้งในภายหลัง
                </CardDescription>
            </CardHeader>
            {indexCreationUrl && (
                <CardContent>
                    <Button asChild variant="outline">
                        <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            ตรวจสอบสถานะ
                        </a>
                    </Button>
                </CardContent>
            )}
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
                    ฐานข้อมูลต้องการดัชนี (Index) เพื่อกรองและเรียงข้อมูลงานตามที่คุณต้องการ
                    กรุณากดปุ่มด้านล่างเพื่อเปิดหน้าสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที)
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
    <>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {jobs.map(job => (
        <Card key={job.id} className="flex flex-col overflow-hidden">
          <div className="relative aspect-[16/10] w-full bg-muted">
            {job.photos && job.photos.length > 0 ? (
                <Image
                    src={job.photos[0]}
                    alt={job.description || "Job image"}
                    fill
                    className="object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <FileImage className="h-10 w-10 text-muted-foreground/50" />
                </div>
            )}
          </div>
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
              <Badge variant={getStatusVariant(job.status)} className="flex-shrink-0">{JOB_STATUS_DISPLAY[job.status]}</Badge>
            </div>
            <CardDescription>
              Dept: {job.department}
              {job.assigneeName && <span className="font-medium"> • {job.assigneeName}</span>}
              <br />
              Last update: {safeFormat(job.lastActivityAt, 'PP')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
          </CardContent>
          <CardFooter className={cn(
            "mt-auto grid gap-2 p-4", 
            (job.status === 'RECEIVED' || job.status === 'WAITING_QUOTATION' || job.status === 'WAITING_APPROVE' || job.status === 'DONE') ? "grid-cols-2" : "grid-cols-1"
          )}>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/app/jobs/${job.id}`}>
                View Details
                <ArrowRight />
              </Link>
            </Button>
            {job.status === 'RECEIVED' && profile?.department === job.department && (
              <Button 
                variant="default" 
                className="w-full"
                onClick={() => isOfficer ? openAssignDialog(job) : handleAcceptJob(job.id)}
                disabled={isAccepting !== null}
              >
                {isAccepting === job.id ? <Loader2 className="animate-spin" /> : <UserCheck />}
                {isOfficer ? 'มอบหมายงาน' : 'รับงาน'}
              </Button>
            )}
            {(job.status === 'WAITING_QUOTATION' || job.status === 'WAITING_APPROVE') && (
              <Button asChild variant="default" className="w-full">
                <Link href={`/app/office/documents/quotation/new?jobId=${job.id}`}>
                  <Receipt />
                  Quote Price
                </Link>
              </Button>
            )}
            {job.status === 'DONE' && (
               <Button
                variant="default"
                className="w-full"
                onClick={() => handleBillingClick(job)}
              >
                <Receipt />
                Billing
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
    <Dialog open={!!assigningJob} onOpenChange={(isOpen) => { if (!isOpen) setAssigningJob(null) }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>มอบหมายงาน</DialogTitle>
                <DialogDescription>
                    เลือกพนักงานเพื่อรับผิดชอบงานนี้
                </DialogDescription>
            </DialogHeader>
            {isFetchingWorkers ? (
                <div className="flex justify-center items-center h-24">
                    <Loader2 className="animate-spin" />
                </div>
            ) : workers.length > 0 ? (
                <div className="py-4">
                    <Select onValueChange={setSelectedWorkerId} value={selectedWorkerId || ""}>
                        <SelectTrigger>
                            <SelectValue placeholder="เลือกพนักงาน..." />
                        </SelectTrigger>
                        <SelectContent>
                            {workers.map(worker => (
                                <SelectItem key={worker.uid} value={worker.uid}>
                                    {worker.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <p className="py-4 text-muted-foreground">ไม่พบพนักงานในแผนกนี้</p>
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setAssigningJob(null)}>ยกเลิก</Button>
                <Button onClick={handleConfirmAssignment} disabled={!selectedWorkerId || isAccepting !== null}>
                    {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันการมอบหมาย
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <AlertDialog open={!!billingJob} onOpenChange={(isOpen) => !isOpen && setBillingJob(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ต้องการออกใบกำกับภาษีหรือไม่?</AlertDialogTitle>
                <AlertDialogDescription>
                    ลูกค้า &quot;{billingJob?.customerSnapshot.name}&quot; เป็นลูกค้าที่ใช้ใบกำกับภาษี
                    กรุณาเลือกประเภทเอกสารที่ต้องการออก
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <Button variant="outline" onClick={() => setBillingJob(null)}>Cancel</Button>
                <Button variant="secondary" onClick={() => {
                    if (billingJob) router.push(`/app/office/documents/delivery-note/new?jobId=${billingJob.id}`);
                    setBillingJob(null);
                }}>
                    ใบส่งของ
                </Button>
                <Button onClick={() => {
                    if (billingJob) router.push(`/app/office/documents/tax-invoice/new?jobId=${billingJob.id}`);
                    setBillingJob(null);
                }}>
                    ใบกำกับภาษี
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
