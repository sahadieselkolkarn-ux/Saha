"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch,
  getDocs,
  limit,
  orderBy
} from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Search, 
  Eye, 
  UserCheck, 
  PackageCheck, 
  Ban, 
  Check, 
  Clock, 
  FileText, 
  Package,
  Share2
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Job, JobStatus, JobDepartment, UserProfile, Vendor } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actionPreset?: 'default' | 'waitingApprove' | 'pendingPartsReady';
}

export function JobList({ 
  department, 
  status,
  assigneeUid,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา",
  actionPreset = 'default'
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  
  const [assigningJob, setAssigningJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const [outsourcingJob, setOutsourcingJob] = useState<Job | null>(null);
  const [outsourceVendors, setOutsourceVendors] = useState<{id: string, name: string}[]>([]);
  const [isFetchingVendors, setIsFetchingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [outsourceNotes, setOutsourceNotes] = useState("");

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [jobForPartsReady, setJobForPartsReady] = useState<Job | null>(null);

  const isOfficer = (profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'OFFICE' || profile?.department === 'MANAGEMENT');

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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      if (status) {
        const statusArray = Array.isArray(status) ? status : [status];
        jobsData = jobsData.filter(job => statusArray.includes(job.status));
      }

      setJobs(jobsData);
      setLoading(false);
    }, (error) => {
      console.error("Error loading jobs:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load jobs." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, department, status, assigneeUid, toast]);

  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) return jobs;
    const lowercasedFilter = searchTerm.toLowerCase();
    return jobs.filter(job =>
      job.customerSnapshot.name.toLowerCase().includes(lowercasedFilter) ||
      job.customerSnapshot.phone.includes(searchTerm) ||
      job.description.toLowerCase().includes(lowercasedFilter)
    );
  }, [jobs, searchTerm]);

  const handleAcceptJob = async (jobId: string) => {
    if (!db || !profile) return;
    setIsAccepting(jobId);
    try {
      const jobDocRef = doc(db, "jobs", jobId);
      await updateDoc(jobDocRef, {
        status: "IN_PROGRESS",
        assigneeUid: profile.uid,
        assigneeName: profile.displayName,
        lastActivityAt: serverTimestamp(),
      });
      
      const activityDocRef = doc(collection(db, "jobs", jobId, "activities"));
      await setDoc(activityDocRef, {
        text: "รับงานเข้าดำเนินการ",
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
      });

      toast({ title: "รับงานสำเร็จ" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
      const q = query(
        collection(db, "users"),
        where("department", "==", job.department),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const snapshot = await getDocs(q);
      const workersList = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      setWorkers(workersList);
    } catch (error) {
      toast({ variant: 'destructive', title: "Failed to fetch workers" });
    } finally {
      setIsFetchingWorkers(false);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!db || !profile || !assigningJob || !selectedWorkerId) return;
    const selectedWorker = workers.find(w => w.uid === selectedWorkerId);
    if (!selectedWorker) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "jobs", assigningJob.id), {
        status: "IN_PROGRESS",
        assigneeUid: selectedWorker.uid,
        assigneeName: selectedWorker.displayName,
        lastActivityAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "jobs", assigningJob.id, "activities")), {
        text: `มอบหมายงานให้ ${selectedWorker.displayName}`,
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: "มอบหมายงานสำเร็จ" });
      setAssigningJob(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: "การมอบหมายงานล้มเหลว", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOutsourceDialog = async (job: Job) => {
    if (!db) return;
    setOutsourcingJob(job);
    setSelectedVendorId(null);
    setOutsourceNotes("");
    setIsFetchingVendors(true);
    try {
      const q = query(collection(db, "vendors"), where("vendorType", "==", "CONTRACTOR"), where("isActive", "==", true));
      const snapshot = await getDocs(q);
      const vendorsList = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().companyName }));
      setOutsourceVendors(vendorsList);
    } catch (error) {
      toast({ variant: 'destructive', title: "Failed to fetch vendors" });
    } finally {
      setIsFetchingVendors(false);
    }
  };

  const handleConfirmOutsource = async () => {
    if (!db || !profile || !outsourcingJob || !selectedVendorId) return;
    const selectedVendor = outsourceVendors.find(v => v.id === selectedVendorId);
    if (!selectedVendor) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "jobs", outsourcingJob.id), {
        department: "OUTSOURCE",
        status: "IN_PROGRESS",
        assigneeUid: selectedVendor.id,
        assigneeName: selectedVendor.name,
        lastActivityAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "jobs", outsourcingJob.id, "activities")), {
        text: `มอบหมายงานให้ร้านนอก: ${selectedVendor.name}. หมายเหตุ: ${outsourceNotes || 'ไม่มี'}`,
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: "มอบหมายงานนอกสำเร็จ" });
      setOutsourcingJob(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: "การมอบหมายงานล้มเหลว", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPartsReady = async () => {
    if (!db || !profile || !jobForPartsReady) return;
    setIsActionLoading(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "jobs", jobForPartsReady.id), {
        status: "IN_REPAIR_PROCESS",
        lastActivityAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "jobs", jobForPartsReady.id, "activities")), {
        text: "เตรียมอะไหล่เรียบร้อยแล้ว แจ้งให้เริ่มดำเนินการซ่อมต่อ",
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: "อัปเดตสถานะสำเร็จ" });
      setJobForPartsReady(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Error", description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร, รายละเอียดงาน..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => (
              <Card key={job.id} className="overflow-hidden">
                <div className="md:flex">
                  <div className="md:w-48 h-48 md:h-auto relative bg-muted">
                    {job.photos && job.photos[0] ? (
                      <Image
                        src={job.photos[0]}
                        alt={job.description}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <FileImage className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold">{job.customerSnapshot.name}</h3>
                          <Badge variant={job.status === 'RECEIVED' ? 'secondary' : 'default'}>
                            {jobStatusLabel(job.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{job.customerSnapshot.phone}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/app/jobs/${job.id}`}>
                            <Eye className="mr-2 h-4 w-4" /> ดูรายละเอียด
                          </Link>
                        </Button>
                        
                        {job.status === 'RECEIVED' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleAcceptJob(job.id)}
                            disabled={isAccepting === job.id}
                          >
                            {isAccepting === job.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            รับงาน
                          </Button>
                        )}

                        {job.status === 'RECEIVED' && isOfficer && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={() => openAssignDialog(job)}
                          >
                            <UserCheck className="mr-2 h-4 w-4" /> มอบหมายงาน
                          </Button>
                        )}

                        {job.status === 'RECEIVED' && isOfficer && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={() => openOutsourceDialog(job)}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" /> ส่งร้านนอก
                          </Button>
                        )}

                        {actionPreset === 'pendingPartsReady' && job.status === 'PENDING_PARTS' && isOfficer && (
                          <Button 
                            size="sm" 
                            onClick={() => setJobForPartsReady(job)}
                          >
                            <PackageCheck className="mr-2 h-4 w-4" /> เตรียมอะไหล่เสร็จสิ้น
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">รายละเอียดงาน:</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
                      </div>
                      <div className="text-sm space-y-1">
                        <p><span className="text-muted-foreground">แผนก:</span> {deptLabel(job.department)}</p>
                        {job.assigneeName && <p><span className="text-muted-foreground">ผู้รับผิดชอบ:</span> {job.assigneeName}</p>}
                        <p><span className="text-muted-foreground">รับงานเมื่อ:</span> {safeFormat(job.createdAt, 'PPp')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-12 text-center">
              <h3 className="text-lg font-medium">{emptyTitle}</h3>
              <p className="text-muted-foreground">{emptyDescription}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={!!assigningJob} onOpenChange={(open) => !open && setAssigningJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>มอบหมายงานให้ช่าง</DialogTitle>
            <DialogDescription>เลือกช่างในแผนกเพื่อรับผิดชอบงานนี้</DialogDescription>
          </DialogHeader>
          {isFetchingWorkers ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="worker">ช่างผู้รับผิดชอบ</Label>
                <Select value={selectedWorkerId || ""} onValueChange={setSelectedWorkerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกช่าง..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.length > 0 ? (
                      workers.map(w => (
                        <SelectItem key={w.uid} value={w.uid}>{w.displayName}</SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground text-center">ไม่พบรายชื่อช่างในแผนกนี้</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningJob(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button onClick={handleConfirmAssignment} disabled={isSubmitting || !selectedWorkerId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} ยืนยันการมอบหมาย
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!outsourcingJob} onOpenChange={(open) => !open && setOutsourcingJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ส่งต่องานนอก (Outsource)</DialogTitle>
            <DialogDescription>เลือกผู้รับเหมาหรือร้านนอกเพื่อส่งต่องาน</DialogDescription>
          </DialogHeader>
          {isFetchingVendors ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="vendor">ผู้รับเหมา / ร้านนอก</Label>
                <Select value={selectedVendorId || ""} onValueChange={setSelectedVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกผู้รับเหมา..." />
                  </SelectTrigger>
                  <SelectContent>
                    {outsourceVendors.length > 0 ? (
                      outsourceVendors.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground text-center">ไม่พบรายชื่อผู้รับเหมา</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="note">หมายเหตุการส่งงาน</Label>
                <Textarea 
                  id="note" 
                  placeholder="เช่น รายละเอียดที่ต้องการให้ร้านนอกทำ..." 
                  value={outsourceNotes}
                  onChange={(e) => setOutsourceNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutsourcingJob(null)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button onClick={handleConfirmOutsource} disabled={isSubmitting || !selectedVendorId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} ยืนยันการส่งงาน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!jobForPartsReady} onOpenChange={(open) => !open && setJobForPartsReady(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันอะไหล่พร้อมซ่อม?</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะแจ้งพนักงานว่าได้รับอะไหล่ครบถ้วนแล้ว เพื่อดำเนินการซ่อมในขั้นตอนถัดไป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionLoading}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPartsReady} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "ยืนยัน"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
