"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  deleteDoc,
  Timestamp 
} from "firebase/firestore";
import { useFirebase, useCollection, WithId } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Search, 
  Eye, 
  MoreHorizontal, 
  Trash2, 
  AlertCircle,
  FileText,
  UserCheck
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import type { Job, JobStatus, JobDepartment, UserProfile } from "@/lib/types";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actionPreset?: 'waitingApprove' | 'pendingPartsReady';
}

export function JobList({ 
  department, 
  status,
  assigneeUid,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา",
  actionPreset
}: JobListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<WithId<Job> | null>(null);
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<WithId<Job> | null>(null);
  const [departmentWorkers, setDepartmentWorkers] = useState<WithId<UserProfile>[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);

  const jobsQuery = useMemo(() => {
    if (!db) return null;
    let q = query(collection(db, "jobs"), orderBy("lastActivityAt", "desc"));
    
    if (department) {
      q = query(q, where("department", "==", department));
    }
    
    if (assigneeUid) {
      q = query(q, where("assigneeUid", "==", assigneeUid));
    }

    return q;
  }, [db, department, assigneeUid]);

  const { data: allJobs, isLoading } = useCollection<Job>(jobsQuery);

  const filteredJobs = useMemo(() => {
    if (!allJobs) return [];
    let result = allJobs;

    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      result = result.filter(j => statusArray.includes(j.status));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(j => 
        j.customerSnapshot.name.toLowerCase().includes(term) ||
        j.customerSnapshot.phone.includes(term) ||
        j.description.toLowerCase().includes(term) ||
        j.docNo?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [allJobs, status, searchTerm]);

  const handleDelete = async () => {
    if (!db || !jobToDelete) return;
    const docRef = doc(db, "jobs", jobToDelete.id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
    setJobToDelete(null);
    setIsDeleteAlertOpen(false);
  };

  const updateStatus = async (jobId: string, newStatus: JobStatus, actionName: string) => {
    if (!db) return;
    const docRef = doc(db, "jobs", jobId);
    const updateData = { 
      status: newStatus,
      lastActivityAt: serverTimestamp()
    };
    
    updateDoc(docRef, updateData).then(() => {
      toast({ title: "อัปเดตสถานะสำเร็จ", description: `เปลี่ยนสถานะเป็น ${jobStatusLabel(newStatus)}` });
    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  if (filteredJobs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Card className="text-center py-12">
          <CardHeader>
            <CardTitle>{emptyTitle}</CardTitle>
            <CardDescription>{emptyDescription}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่รับงาน</TableHead>
                <TableHead>เลขที่ใบงาน</TableHead>
                <TableHead>ลูกค้า</TableHead>
                {!department && <TableHead>แผนก</TableHead>}
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-sm">
                    {safeFormat(job.createdAt, 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {job.id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{job.customerSnapshot.name}</div>
                    <div className="text-xs text-muted-foreground">{job.customerSnapshot.phone}</div>
                  </TableCell>
                  {!department && <TableCell>{deptLabel(job.department)}</TableCell>}
                  <TableCell>
                    <Badge variant={getStatusVariant(job.status)}>{jobStatusLabel(job.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="ghost" size="icon" title="ดูรายละเอียด">
                        <Link href={`/app/jobs/${job.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actionPreset === 'waitingApprove' && (
                            <DropdownMenuItem onClick={() => updateStatus(job.id, 'PENDING_PARTS', 'อนุมัติ')}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                              อนุมัติ (รออะไหล่)
                            </DropdownMenuItem>
                          )}
                          {actionPreset === 'pendingPartsReady' && (
                            <DropdownMenuItem onClick={() => updateStatus(job.id, 'IN_REPAIR_PROCESS', 'อะไหล่พร้อม')}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                              อะไหล่พร้อม (เริ่มซ่อม)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href={`/app/jobs/${job.id}`}>
                              <FileText className="mr-2 h-4 w-4" />
                              ดูรายละเอียด
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setJobToDelete(job);
                              setIsDeleteAlertOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            ลบใบงาน
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบใบงาน?</AlertDialogTitle>
            <AlertDialogDescription>
              การลบใบงานจะไม่สามารถกู้คืนได้ คุณแน่ใจหรือไม่ที่จะลบใบงานของ {jobToDelete?.customerSnapshot.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              ยืนยันการลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
