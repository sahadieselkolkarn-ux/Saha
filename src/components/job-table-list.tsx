

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, type OrderByDirection, type QueryConstraint, type FirestoreError, limit, doc, deleteDoc, writeBatch, deleteField, serverTimestamp, getDocs, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, ExternalLink, MoreHorizontal, Edit, Trash2, Undo2, Eye } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { archiveCollectionNameByYear } from "@/lib/archive-utils";

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
  source?: 'active' | 'archive';
  year?: number;
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
  children,
  source = 'active',
  year = new Date().getFullYear(),
}: JobTableListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  
  const [indexState, setIndexState] = useState<'ok' | 'missing' | 'building'>('ok');
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(0);
  const [pageStartCursors, setPageStartCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  const [jobToRevert, setJobToRevert] = useState<Job | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [isReverting, setIsReverting] = useState(false);

  const isUserAdmin = profile?.role === 'ADMIN';
  
  const fetchData = useCallback(async () => {
    if (!db) return;

    setLoading(true);
    setError(null);
    setIndexState('ok');
    setIndexCreationUrl(null);

    try {
      const collectionName = source === 'archive' ? archiveCollectionNameByYear(year) : 'jobs';
      const qConstraints: QueryConstraint[] = [];

      if (source === 'active') {
        if (department) qConstraints.push(where('department', '==', department));
        if (status) qConstraints.push(where('status', '==', status));
        qConstraints.push(orderBy(orderByField, orderByDirection));
      }

      const cursor = pageStartCursors[currentPage];
      if (cursor) {
        qConstraints.push(startAfter(cursor));
      }

      if (limitProp) {
        qConstraints.push(limit(limitProp));
      }

      const finalQuery = query(collection(db, collectionName), ...qConstraints);
      const snapshot = await getDocs(finalQuery);

      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

      if (source === 'archive') {
        if (department) jobsData = jobsData.filter(job => job.department === department);
        if (status) jobsData = jobsData.filter(job => job.status === status);
        if(orderByField === 'closedDate') {
          jobsData.sort((a,b) => (b.closedDate || '').localeCompare(a.closedDate || ''));
        }
      }
      
      if (excludeStatus) {
        const statusesToExclude = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
        jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
      }
      
      setJobs(jobsData);
      
      const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
      if (lastVisibleDoc && currentPage >= pageStartCursors.length - 1) {
          const newCursors = [...pageStartCursors];
          newCursors[currentPage + 1] = lastVisibleDoc;
          setPageStartCursors(newCursors);
      }
      
      setIsLastPage(snapshot.docs.length < (limitProp || 10));

    } catch (err: any) {
      setError(err);
      if (err.message?.includes('requires an index')) {
          const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
          if (urlMatch) setIndexCreationUrl(urlMatch[0]);
          if (err.message.includes('currently building')) {
              setIndexState('building');
          } else {
              setIndexState('missing');
          }
      }
    } finally {
      setLoading(false);
    }
  }, [db, source, year, department, status, orderByField, orderByDirection, limitProp, JSON.stringify(excludeStatus), currentPage, pageStartCursors]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) {
      return jobs;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return jobs.filter(job =>
      job.customerSnapshot.name.toLowerCase().includes(lowercasedFilter) ||
      job.customerSnapshot.phone.includes(searchTerm) ||
      job.description.toLowerCase().includes(lowercasedFilter) ||
      job.carServiceDetails?.licensePlate?.toLowerCase().includes(lowercasedFilter) ||
      job.id.toLowerCase().includes(lowercasedFilter)
    );
  }, [jobs, searchTerm]);

  const handleNextPage = () => {
    if (!isLastPage) {
        setCurrentPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
      if (currentPage > 0) {
          setPageStartCursors(prev => prev.slice(0, currentPage));
          setCurrentPage(p => p - 1);
      }
  };

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

  const handleRevertRequest = (job: Job) => {
    setJobToRevert(job);
    setRevertReason("");
  };

  const confirmRevert = async () => {
    if (!db || !profile || !jobToRevert || !revertReason) {
      toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "กรุณากรอกเหตุผล" });
      return;
    }
    if (profile.role !== 'ADMIN') {
        toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "เฉพาะแอดมินเท่านั้น" });
        return;
    }
    
    setIsReverting(true);
    try {
      const batch = writeBatch(db);
      const jobRef = doc(db, 'jobs', jobToRevert.id);
      const activityRef = doc(collection(db, 'jobs', jobToRevert.id, 'activities'));
      
      const originalPickupDate = jobToRevert.pickupDate ? safeFormat(new Date(jobToRevert.pickupDate), 'dd/MM/yy') : '-';

      // 1. Update job status and clear dates
      batch.update(jobRef, {
        status: 'WAITING_CUSTOMER_PICKUP',
        pickupDate: deleteField(),
        closedDate: deleteField(),
        lastActivityAt: serverTimestamp(),
      });

      // 2. Add activity log
      batch.set(activityRef, {
        text: `แอดมินย้อนสถานะจาก "ปิดงาน" → "รอลูกค้ารับสินค้า" (ยกเลิกการปิดงานเดิมวันที่: ${originalPickupDate}) เหตุผล: ${revertReason}`,
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
        photos: [],
      });

      await batch.commit();
      toast({ title: 'ย้อนสถานะงานสำเร็จ' });
      setJobToRevert(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'การย้อนสถานะล้มเหลว', description: error.message });
    } finally {
      setIsReverting(false);
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
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                      <TableRow>
                          <TableHead className="w-[250px]">Customer</TableHead>
                          <TableHead className="hidden md:table-cell">Department</TableHead>
                          <TableHead className="hidden md:table-cell">Description</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden md:table-cell">Last Updated</TableHead>
                          <TableHead className="sticky right-0 bg-background text-right">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {filteredJobs.map(job => (
                          <TableRow key={job.id}>
                              <TableCell className="font-medium">
                                {job.customerSnapshot.name}
                                <div className="md:hidden text-xs text-muted-foreground mt-1">
                                    {deptLabel(job.department)} • {safeFormat(job.lastActivityAt, 'dd/MM/yy')}
                                </div>
                                <div className="md:hidden text-xs text-muted-foreground line-clamp-2">
                                    {job.description}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{deptLabel(job.department)}</TableCell>
                              <TableCell className="max-w-xs truncate hidden md:table-cell">{job.description}</TableCell>
                              <TableCell>
                                  <Badge variant={getStatusVariant(job.status)}>{jobStatusLabel(job.status)}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{safeFormat(job.lastActivityAt, 'dd/MM/yy')}</TableCell>
                              <TableCell className="sticky right-0 bg-background text-right whitespace-nowrap">
                                <Button asChild variant="outline" size="sm">
                                  <Link href={`/app/jobs/${job.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    ดูรายละเอียด
                                  </Link>
                                </Button>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
          </CardContent>
          {(filteredJobs.length > 0 && limitProp) && (
            <CardFooter>
                <div className="flex w-full justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage + 1}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handlePrevPage} disabled={currentPage === 0 || loading}>
                            Previous
                        </Button>
                        <Button variant="outline" onClick={handleNextPage} disabled={isLastPage || loading}>
                            Next
                        </Button>
                    </div>
                </div>
            </CardFooter>
          )}
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
      <Dialog open={!!jobToRevert} onOpenChange={(isOpen) => !isOpen && setJobToRevert(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>ย้อนสถานะงาน</DialogTitle>
                <DialogDescription>
                    งานจะถูกย้อนกลับไปสถานะ "รอลูกค้ารับสินค้า" กรุณากรอกเหตุผล
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
                <Label htmlFor="revertReason">เหตุผล (จำเป็น)</Label>
                <Textarea
                    id="revertReason"
                    value={revertReason}
                    onChange={(e) => setRevertReason(e.target.value)}
                    placeholder="เช่น ปิดงานผิด, ลูกค้ายังไม่ได้รับของ"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setJobToRevert(null)} disabled={isReverting}>ยกเลิก</Button>
                <Button onClick={confirmRevert} disabled={isReverting || !revertReason}>
                    {isReverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันย้อนสถานะ
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
