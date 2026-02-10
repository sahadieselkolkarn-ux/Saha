"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, type OrderByDirection, type QueryConstraint, type FirestoreError, limit, doc, getDocs, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, ExternalLink, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
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
  limit: limitProp = 20,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ไม่มีข้อมูลงานซ่อมที่ตรงกับเงื่อนไข",
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

  const fetchData = useCallback(async (cursor: QueryDocumentSnapshot | null) => {
    if (!db) return;

    setLoading(true);
    setError(null);
    setIndexState('ok');
    setIndexCreationUrl(null);

    try {
      const collectionName = source === 'archive' ? archiveCollectionNameByYear(year) : 'jobs';
      const qConstraints: QueryConstraint[] = [];

      if (searchTerm.trim()) {
        if (department) qConstraints.push(where('department', '==', department));
        if (status) qConstraints.push(where('status', '==', status));
        qConstraints.push(orderBy(orderByField, orderByDirection));
        qConstraints.push(limit(500)); 
      } else {
        if (source === 'active') {
          if (department) qConstraints.push(where('department', '==', department));
          if (status) qConstraints.push(where('status', '==', status));
          qConstraints.push(orderBy(orderByField, orderByDirection));
        }

        if (cursor) {
          qConstraints.push(startAfter(cursor));
        }

        qConstraints.push(limit(limitProp));
      }

      const finalQuery = query(collection(db, collectionName), ...qConstraints);
      const snapshot = await getDocs(finalQuery);

      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

      if (excludeStatus) {
        const statusesToExclude = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
        jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
      }
      
      setJobs(jobsData);
      
      if (!searchTerm.trim()) {
        const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        if (lastVisibleDoc && currentPage === pageStartCursors.length - 1) {
            setPageStartCursors(prev => {
                const next = [...prev];
                next[currentPage + 1] = lastVisibleDoc;
                return next;
            });
        }
        setIsLastPage(snapshot.docs.length < limitProp);
      } else {
        setIsLastPage(true);
      }

    } catch (err: any) {
      console.error("Fetch data error:", err);
      setError(err);
      if (err.message?.includes('requires an index')) {
          const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
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
  }, [db, source, year, department, status, orderByField, orderByDirection, limitProp, excludeStatus, currentPage, searchTerm, pageStartCursors.length]);

  useEffect(() => {
    fetchData(pageStartCursors[currentPage] || null);
  }, [fetchData, currentPage]);
  
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) {
      return jobs;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return jobs.filter(job =>
      (job.customerSnapshot?.name || "").toLowerCase().includes(lowercasedFilter) ||
      (job.customerSnapshot?.phone || "").includes(searchTerm) ||
      (job.description || "").toLowerCase().includes(lowercasedFilter) ||
      (job.carServiceDetails?.licensePlate || "").toLowerCase().includes(lowercasedFilter) ||
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
          setCurrentPage(p => p - 1);
      }
  };

  if (loading && jobs.length === 0) {
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
                    ฐานข้อมูลต้องการ Index เพื่อกรองและเรียงข้อมูล กรุณากดปุ่มด้านล่างเพื่อสร้างใน Firebase Console
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
                                  <Badge variant={getStatusVariant(job.status)} className={cn(job.status === 'RECEIVED' && "animate-blink")}>{jobStatusLabel(job.status)}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{safeFormat(job.lastActivityAt, 'dd/MM/yy')}</TableCell>
                              <TableCell className="sticky right-0 bg-background text-right whitespace-nowrap">
                                <div className="flex justify-end gap-2">
                                    <Button asChild variant="ghost" size="icon" title="ดูรายละเอียด">
                                        <Link href={`/app/jobs/${job.id}`}><Eye className="h-4 w-4" /></Link>
                                    </Button>
                                </div>
                              </TableCell>
                          </TableRow>
                      ))}
                      {filteredJobs.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                {searchTerm ? "ไม่พบข้อมูลที่ตรงกับการค้นหา" : emptyTitle}
                            </TableCell>
                        </TableRow>
                      )}
                  </TableBody>
                </Table>
              </div>
          </CardContent>
          {(!searchTerm.trim() && filteredJobs.length > 0) && (
            <CardFooter>
                <div className="flex w-full justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                            หน้า {currentPage + 1}
                        </span>
                        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 0 || loading}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> ก่อนหน้า
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleNextPage} disabled={isLastPage || loading}>
                            ถัดไป <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </CardFooter>
          )}
          {searchTerm.trim() && (
            <CardFooter className="justify-center bg-muted/20 py-2">
                <p className="text-xs text-muted-foreground italic">แสดงผลลัพธ์การค้นหาจากข้อมูลล่าสุด 500 รายการ (การแบ่งหน้าถูกปิดชั่วคราวขณะค้นหา)</p>
            </CardFooter>
          )}
      </Card>
    </>
  );
}
