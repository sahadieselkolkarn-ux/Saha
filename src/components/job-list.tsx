"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, writeBatch, limit, getDoc, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Eye, UserCheck, MoreHorizontal, Trash2, CheckCircle, FileText, XCircle, PackageCheck, Ban } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Job, JobStatus, JobDepartment, UserProfile } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  excludeStatus?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actionPreset?: 'waitingApprove' | 'pendingPartsReady';
  searchTerm?: string;
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
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา",
  actionPreset,
  searchTerm: externalSearchTerm
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [availableWorkers, setAvailableWorkers] = useState<WithId<UserProfile>[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const activeSearchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const isOfficeOrAdminOrMgmt = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'OFFICE' || profile?.department === 'MANAGEMENT';

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    let q = query(collection(db, "jobs"), orderBy("lastActivityAt", "desc"));
    
    if (department) {
      q = query(q, where("department", "==", department));
    }
    
    if (assigneeUid) {
      q = query(q, where("assigneeUid", "==", assigneeUid));
    }

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
        setJobs(jobsData);
        setLoading(false);
      }, 
      async (error: any) => {
        if (error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: 'jobs',
            operation: 'list',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        } else {
          toast({ variant: "destructive", title: "Error loading jobs", description: error.message });
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [db, department, assigneeUid, toast]);

  const filteredJobs = useMemo(() => {
    let result = jobs;

    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      result = result.filter(j => statusArray.includes(j.status));
    }

    if (excludeStatus) {
      const excludeArray = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
      result = result.filter(j => !excludeArray.includes(j.status));
    }

    if (activeSearchTerm.trim()) {
      const term = activeSearchTerm.toLowerCase();
      result = result.filter(j => 
        j.customerSnapshot.name.toLowerCase().includes(term) ||
        j.customerSnapshot.phone.includes(term) ||
        j.description.toLowerCase().includes(term) ||
        (j.id && j.id.toLowerCase().includes(term))
      );
    }

    return result;
  }, [jobs, status, excludeStatus, activeSearchTerm]);

  const handleOpenAssignDialog = async (job: Job) => {
    if (!db) return;
    setSelectedJobId(job.id);
    setSelectedWorkerId(null);
    setIsAssignDialogOpen(true);
    setIsFetchingWorkers(true);
    try {
      const q = query(collection(db, "users"), where("department", "==", job.department), where("role", "==", "WORKER"), where("status", "==", "ACTIVE"));
      const snapshot = await getDocs(q);
      const workers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithId<UserProfile>));
      setAvailableWorkers(workers);
    } catch (error) {
      toast({ variant: 'destructive', title: "Failed to fetch workers" });
    } finally {
      setIsFetchingWorkers(false);
    }
  };

  const handleAssignJob = async () => {
    if (!db || !profile || !selectedJobId || !selectedWorkerId) return;
    const worker = availableWorkers.find(w => w.id === selectedWorkerId);
    if (!worker) return;
    
    setIsAssigning(true);
    const jobRef = doc(db, "jobs", selectedJobId);
    const activityRef = doc(collection(db, "jobs", selectedJobId, "activities"));
    
    const batch = writeBatch(db);
    batch.update(jobRef, { 
      assigneeUid: worker.id, 
      assigneeName: worker.displayName, 
      status: 'IN_PROGRESS', 
      lastActivityAt: serverTimestamp() 
    });
    batch.set(activityRef, { 
      text: `มอบหมายงานให้: ${worker.displayName}`, 
      userName: profile.displayName, 
      userId: profile.uid, 
      createdAt: serverTimestamp() 
    });
    
    batch.commit().then(() => {
      toast({ title: "Assign Successful", description: `Job assigned to ${worker.displayName}` });
      setIsAssignDialogOpen(false);
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: jobRef.path,
        operation: 'update',
        requestResourceData: { assigneeUid: worker.id },
      });
      errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
      setIsAssigning(false);
    });
  };

  const updateJobStatus = async (jobId: string, newStatus: JobStatus, activityText: string) => {
    if (!db || !profile) return;
    setIsActionLoading(true);
    const jobRef = doc(db, "jobs", jobId);
    const activityRef = doc(collection(db, "jobs", jobId, "activities"));
    
    const batch = writeBatch(db);
    batch.update(jobRef, { status: newStatus, lastActivityAt: serverTimestamp() });
    batch.set(activityRef, { text: activityText, userName: profile.displayName, userId: profile.uid, createdAt: serverTimestamp() });
    
    batch.commit().then(() => {
      toast({ title: "Status Updated", description: `Job status changed to ${jobStatusLabel(newStatus)}` });
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: jobRef.path,
        operation: 'update',
        requestResourceData: { status: newStatus },
      });
      errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
      setIsActionLoading(false);
    });
  };

  const handleDeleteJob = async () => {
    if (!db || !jobToDelete) return;
    setIsActionLoading(true);
    const jobRef = doc(db, "jobs", jobToDelete.id);
    deleteDoc(jobRef).then(() => {
      toast({ title: "Job Deleted", description: "The job has been permanently removed." });
      setIsDeleteAlertOpen(false);
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: jobRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
      setIsActionLoading(false);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {externalSearchTerm === undefined && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร..."
              className="pl-10"
              value={internalSearchTerm}
              onChange={(e) => setInternalSearchTerm(e.target.value)}
            />
          </div>
        )}

        {filteredJobs.length === 0 ? (
          <Card className="text-center py-12">
            <CardHeader>
              <CardTitle>{emptyTitle}</CardTitle>
              <CardDescription>{emptyDescription}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredJobs.map((job) => (
              <Card key={job.id} className="flex flex-col h-full overflow-hidden">
                <div className="relative h-48 bg-muted">
                  {job.photos && job.photos.length > 0 ? (
                    <Image
                      src={job.photos[0]}
                      alt={job.description}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      No Image
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge variant={getStatusVariant(job.status)}>
                      {jobStatusLabel(job.status)}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{job.customerSnapshot.name}</CardTitle>
                      <CardDescription className="text-sm">{job.customerSnapshot.phone}</CardDescription>
                    </div>
                    {isOfficeOrAdminOrMgmt && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/app/jobs/${job.id}`}>View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {job.status === 'RECEIVED' && (
                            <DropdownMenuItem onClick={() => handleOpenAssignDialog(job)}>
                              Assign Technician
                            </DropdownMenuItem>
                          )}
                          {job.status === 'WAITING_APPROVE' && (
                            <>
                              <DropdownMenuItem onClick={() => updateJobStatus(job.id, 'PENDING_PARTS', 'ลูกค้าอนุมัติซ่อม')}>
                                Customer Approved
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateJobStatus(job.id, 'CLOSED', 'ลูกค้าไม่อนุมัติ')}>
                                Customer Declined
                              </DropdownMenuItem>
                            </>
                          )}
                          {job.status === 'PENDING_PARTS' && (
                            <DropdownMenuItem onClick={() => updateJobStatus(job.id, 'IN_REPAIR_PROCESS', 'อะไหล่พร้อมซ่อม')}>
                              Parts Ready
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              setJobToDelete(job);
                              setIsDeleteAlertOpen(true);
                            }}
                          >
                            Delete Job
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex-grow">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Description:</div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {job.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                      <span className="font-semibold">{deptLabel(job.department)}</span>
                      <span>•</span>
                      <span>Updated {safeFormat(job.lastActivityAt, 'dd/MM/yy HH:mm')}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={`/app/jobs/${job.id}`}>View Details</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Technician</DialogTitle>
            <DialogDescription>
              Select a technician from the {selectedJobId ? jobs.find(j => j.id === selectedJobId)?.department : ''} department.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isFetchingWorkers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Technician</Label>
                  <Select value={selectedWorkerId || ""} onValueChange={setSelectedWorkerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a technician..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWorkers.length > 0 ? (
                        availableWorkers.map((worker) => (
                          <SelectItem key={worker.id} value={worker.id}>
                            {worker.displayName}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No technicians available in this department.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignJob} disabled={isAssigning || !selectedWorkerId}>
              {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the job record from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteJob} 
              disabled={isActionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
