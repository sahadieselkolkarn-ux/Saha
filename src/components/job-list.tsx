
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  startAfter, 
  QueryDocumentSnapshot, 
  type OrderByDirection, 
  type QueryConstraint, 
  type FirestoreError 
} from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ArrowRight, 
  Loader2, 
  PlusCircle, 
  Search, 
  FileImage, 
  AlertCircle, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
  Receipt
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useRouter } from "next/navigation";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  excludeStatus?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  searchTerm?: string;
  actionPreset?: 'waitingApprove' | 'pendingPartsReady';
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
  emptyDescription = "ยังไม่มีรายการงานในระบบ",
  searchTerm = "",
  actionPreset
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(0);
  const pageStartCursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const [billingJob, setBillingJob] = useState<Job | null>(null);

  const memoizedStatusArray = useMemo(() => {
    if (!status) return [];
    return Array.isArray(status) ? status : [status];
  }, [status]);

  const memoizedExcludeStatusArray = useMemo(() => {
    if (!excludeStatus) return [];
    return Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
  }, [excludeStatus]);

  const isOfficeOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'OFFICE' || profile?.department === 'MANAGEMENT';

  const fetchData = useCallback(async (pageIndex: number) => {
    if (!db) return;

    setLoading(true);
    setError(null);
    setIndexUrl(null);

    try {
      const isSearch = !!searchTerm.trim();
      const qConstraints: QueryConstraint[] = [];
      
      if (department) qConstraints.push(where('department', '==', department));
      if (assigneeUid) qConstraints.push(where('assigneeUid', '==', assigneeUid));
      
      if (memoizedStatusArray.length > 0) {
        qConstraints.push(where('status', 'in', memoizedStatusArray));
      } else if (!isSearch && memoizedExcludeStatusArray.length > 0) {
        qConstraints.push(where('status', 'not-in', memoizedExcludeStatusArray));
      }
      
      qConstraints.push(orderBy('lastActivityAt', 'desc'));

      if (isSearch) {
        qConstraints.push(limit(200));
      } else {
        const cursor = pageStartCursors.current[pageIndex];
        if (cursor) {
          qConstraints.push(startAfter(cursor));
        }
        qConstraints.push(limit(12));
      }

      const q = query(collection(db, "jobs"), ...qConstraints);
      const snapshot = await getDocs(q);
      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      if (isSearch) {
        const term = searchTerm.toLowerCase().trim();
        jobsData = jobsData.filter(j => 
          (j.customerSnapshot?.name || "").toLowerCase().includes(term) ||
          (j.customerSnapshot?.phone || "").includes(term) ||
          (j.description || "").toLowerCase().includes(term) ||
          (j.id && j.id.toLowerCase().includes(term))
        );
        setIsLastPage(true);
      } else {
        setIsLastPage(snapshot.docs.length < 12);
        if (snapshot.docs.length > 0) {
          pageStartCursors.current[pageIndex + 1] = snapshot.docs[snapshot.docs.length - 1];
        }
      }
      
      setJobs(jobsData);
    } catch (err: any) {
      console.error("Error fetching jobs:", err);
      setError(err);
      if (err.message?.includes('requires an index')) {
        const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          setIndexUrl(urlMatch[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [db, department, assigneeUid, memoizedStatusArray, memoizedExcludeStatusArray, searchTerm]);

  useEffect(() => {
    setCurrentPage(0);
    pageStartCursors.current = [null];
    fetchData(0);
  }, [searchTerm, status, department, memoizedExcludeStatusArray, fetchData]);

  const handleNextPage = () => {
    if (!isLastPage) {
      const nextIdx = currentPage + 1;
      setCurrentPage(nextIdx);
      fetchData(nextIdx);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      const prevIdx = currentPage - 1;
      setCurrentPage(prevIdx);
      fetchData(prevIdx);
    }
  };

  if (indexUrl) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/20 rounded-lg border-2 border-dashed">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-bold mb-2">ต้องสร้างดัชนี (Index) สำหรับคิวรีนี้</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          ระบบต้องการการสร้างดัชนีในฐานข้อมูลเพื่อให้สามารถแสดงข้อมูลได้ถูกต้อง กรุณาคลิกปุ่มด้านล่างเพื่อสร้างดัชนี
        </p>
        <Button asChild>
          <a href={indexUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            กดเพื่อสร้าง Index (Firebase Console)
          </a>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardHeader>
          <CardTitle className="text-muted-foreground">{emptyTitle}</CardTitle>
          <CardDescription>{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {jobs.map((job) => (
          <Card key={job.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative aspect-video bg-muted">
              {job.photos && job.photos.length > 0 ? (
                <Image
                  src={job.photos[0]}
                  alt={job.description}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <FileImage className="h-10 w-10 opacity-20" />
                </div>
              )}
              <Badge 
                variant={getStatusVariant(job.status)}
                className="absolute top-2 right-2 shadow-sm border-white/20"
              >
                {jobStatusLabel(job.status)}
              </Badge>
            </div>
            <CardHeader className="p-4 space-y-1">
              <CardTitle className="text-base line-clamp-1">{job.customerSnapshot.name}</CardTitle>
              <CardDescription className="text-[10px]">
                {deptLabel(job.department)} • {safeFormat(job.lastActivityAt, "dd/MM/yy HH:mm")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-grow">
              <p className="text-sm line-clamp-2 text-muted-foreground">
                {job.description}
              </p>
            </CardContent>
            <CardFooter className="px-4 pb-4 pt-0 flex flex-col gap-2">
              <Button asChild className="w-full h-9" variant="secondary">
                <Link href={`/app/jobs/${job.id}`}>
                  ดูรายละเอียด
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {job.status === 'WAITING_QUOTATION' && (
                <Button 
                  disabled={!isOfficeOrAdmin}
                  asChild={isOfficeOrAdmin}
                  className="w-full h-9 bg-primary hover:bg-primary/90 text-white font-bold" 
                  variant="default"
                >
                  {isOfficeOrAdmin ? (
                    <Link href={`/app/office/documents/quotation/new?jobId=${job.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      สร้างใบเสนอราคา
                    </Link>
                  ) : (
                    <span className="flex items-center opacity-50">
                      <FileText className="mr-2 h-4 w-4" />
                      สร้างใบเสนอราคา
                    </span>
                  )}
                </Button>
              )}
              {['DONE', 'WAITING_CUSTOMER_PICKUP'].includes(job.status) && (
                <Button 
                  className="w-full h-9 border-primary text-primary hover:bg-primary/10 font-bold" 
                  variant="outline"
                  disabled={!isOfficeOrAdmin}
                  onClick={() => setBillingJob(job)}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  ออกบิล
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {!searchTerm && (
        <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">หน้า {currentPage + 1}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> ก่อนหน้า
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={isLastPage}>
              ถัดไป <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Billing Dialog */}
      <AlertDialog open={!!billingJob} onOpenChange={(open) => !open && setBillingJob(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>เลือกประเภทเอกสาร</AlertDialogTitle>
              <AlertDialogDescription>กรุณาเลือกประเภทเอกสารที่ต้องการออกสำหรับงานซ่อมของ <b>{billingJob?.customerSnapshot.name}</b></AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setBillingJob(null)} className="w-full sm:w-auto">ยกเลิก</Button>
                <Button 
                  variant="secondary" 
                  onClick={() => { if (billingJob) router.push(`/app/office/documents/delivery-note/new?jobId=${billingJob.id}`); setBillingJob(null); }}
                  className="w-full sm:w-auto"
                >
                  ใบส่งของชั่วคราว
                </Button>
                <Button 
                  onClick={() => { if (billingJob) router.push(`/app/office/documents/tax-invoice/new?jobId=${billingJob.id}`); setBillingJob(null); }}
                  className="w-full sm:w-auto"
                >
                  ใบกำกับภาษี
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
