"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, writeBatch, limit, getDoc, orderBy, type OrderByDirection, type QueryConstraint, type FirestoreError } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Eye, MoreHorizontal, Trash2, CheckCircle, FileText, XCircle, PackageCheck, Ban, ChevronLeft, ChevronRight, AlertCircle, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import { archiveCollectionNameByYear } from "@/lib/archive-utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
  const pageStartCursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const memoizedExcludeStatusString = useMemo(() => {
    if (!excludeStatus) return "";
    return Array.isArray(excludeStatus) ? excludeStatus.join(',') : excludeStatus;
  }, [excludeStatus]);

  const fetchData = useCallback(async (pageIndex: number, isNext: boolean = false) => {
    if (!db) return;

    setLoading(true);
    setError(null);
    setIndexState('ok');
    setIndexCreationUrl(null);

    try {
      const isSearch = !!searchTerm.trim();

      if (isSearch) {
        // Search Mode: Fetch a larger batch and filter client-side
        const collectionName = source === 'archive' ? archiveCollectionNameByYear(year) : 'jobs';
        
        let combined: Job[] = [];
        if (source === 'archive') {
            const fetchYear = async (y: number) => {
                const colName = archiveCollectionNameByYear(y);
                const q = query(collection(db, colName), orderBy(orderByField, orderByDirection), limit(300));
                const snap = await getDocs(q);
                return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            };
            const [jobs1, jobs2] = await Promise.all([fetchYear(year), fetchYear(year - 1)]);
            combined = [...jobs1, ...jobs2];
        } else {
            const q = query(collection(db, 'jobs'), orderBy(orderByField, orderByDirection), limit(300));
            const snap = await getDocs(q);
            combined = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
        }
        
        const term = searchTerm.toLowerCase().trim();
        let filtered = combined.filter(j => 
            (j.customerSnapshot?.name || "").toLowerCase().includes(term) ||
            (j.customerSnapshot?.phone || "").includes(term) ||
            (j.description || "").toLowerCase().includes(term) ||
            (j.id && j.id.toLowerCase().includes(term)) ||
            (j.salesDocNo && j.salesDocNo.toLowerCase().includes(term)) ||
            (j.carServiceDetails?.licensePlate && j.carServiceDetails.licensePlate.toLowerCase().includes(term)) ||
            (j.commonrailDetails?.registrationNumber && j.commonrailDetails.registrationNumber.toLowerCase().includes(term)) ||
            (j.mechanicDetails?.registrationNumber && j.mechanicDetails.registrationNumber.toLowerCase().includes(term))
        );

        if (department) filtered = filtered.filter(j => j.department === department);
        if (status) filtered = filtered.filter(j => j.status === status);
        if (memoizedExcludeStatusString) {
            const ex = memoizedExcludeStatusString.split(',');
            filtered = filtered.filter(j => !ex.includes(j.status));
        }

        setJobs(filtered.slice(0, limitProp));
        setIsLastPage(true);
      } else {
        const collectionName = source === 'archive' ? archiveCollectionNameByYear(year) : 'jobs';
        const qConstraints: QueryConstraint[] = [];
        
        if (department) qConstraints.push(where('department', '==', department));
        if (status) qConstraints.push(where('status', '==', status));
        
        qConstraints.push(orderBy(orderByField, orderByDirection));

        const cursor = pageStartCursors.current[pageIndex];
        // Note: startAfter cursor handling would require further implementation logic for getDocs
        
        qConstraints.push(limit(limitProp));

        const finalQuery = query(collection(db, collectionName), ...qConstraints);
        const snapshot = await getDocs(finalQuery);

        let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

        if (memoizedExcludeStatusString) {
          const statusesToExclude = memoizedExcludeStatusString.split(',');
          jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
        }
        
        setJobs(jobsData);
        setIsLastPage(snapshot.docs.length < limitProp);
      }

    } catch (err: any) {
      if (err.message?.includes('requires an index')) {
          const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
          if (urlMatch) setIndexCreationUrl(urlMatch[0]);
          setIndexState(err.message.includes('currently building') ? 'building' : 'missing');
      } else {
          setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [db, source, year, department, status, orderByField, orderByDirection, limitProp, memoizedExcludeStatusString, searchTerm]);

  useEffect(() => {
    fetchData(currentPage, false);
  }, [currentPage, fetchData]);

  return (
    <>
      <Card className="overflow-hidden border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                      <TableRow>
                          <TableHead className="w-[200px] sm:w-[250px] pl-6 py-4">ลูกค้า (Customer)</TableHead>
                          <TableHead className="hidden md:table-cell py-4">แผนก (Department)</TableHead>
                          <TableHead className="hidden lg:table-cell py-4">รายละเอียด (Description)</TableHead>
                          <TableHead className="w-[120px] py-4">สถานะ (Status)</TableHead>
                          <TableHead className="hidden md:table-cell py-4">อัปเดตล่าสุด</TableHead>
                          <TableHead className="sticky right-0 bg-muted/50 text-right pr-6 py-4">จัดการ</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {jobs.map(job => (
                          <TableRow key={job.id} className="group hover:bg-muted/30 transition-colors">
                              <TableCell className="pl-6 py-4">
                                <div className="font-semibold text-foreground">{job.customerSnapshot.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{job.customerSnapshot.phone}</div>
                                <div className="md:hidden mt-2 flex flex-col gap-1">
                                    <span className="text-[10px] inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-medium w-fit">
                                        {deptLabel(job.department)}
                                    </span>
                                    <div className="text-[10px] line-clamp-1 italic text-muted-foreground">
                                        {job.description}
                                    </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline" className="font-normal">{deptLabel(job.department)}</Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell max-w-[300px]">
                                <div className="truncate text-sm text-muted-foreground" title={job.description}>
                                    {job.description}
                                </div>
                              </TableCell>
                              <TableCell>
                                  <Badge 
                                    variant={getStatusVariant(job.status)} 
                                    className={cn(
                                        "whitespace-nowrap font-medium",
                                        job.status === 'RECEIVED' && "animate-blink"
                                    )}
                                  >
                                    {jobStatusLabel(job.status)}
                                  </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                {safeFormat(job.lastActivityAt, 'dd/MM/yy HH:mm')}
                              </TableCell>
                              <TableCell className="sticky right-0 bg-background/80 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none text-right pr-6 whitespace-nowrap">
                                <div className="flex justify-end gap-2">
                                    <Button asChild variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-sm" title="ดูรายละเอียด">
                                        <Link href={`/app/jobs/${job.id}`}><Eye className="h-4 w-4" /></Link>
                                    </Button>
                                </div>
                              </TableCell>
                          </TableRow>
                      ))}
                      {jobs.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic">
                                <div className="flex flex-col items-center gap-2">
                                    <AlertCircle className="h-8 w-8 opacity-20" />
                                    <p>{searchTerm ? `ไม่พบข้อมูลที่ตรงกับ "${searchTerm}"` : emptyTitle}</p>
                                </div>
                            </TableCell>
                        </TableRow>
                      )}
                  </TableBody>
                </Table>
              </div>
          </CardContent>
          <CardFooter className="p-4 border-t bg-muted/5">
                <div className="flex w-full flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            {searchTerm ? `พบทั้งหมด ${jobs.length} รายการ` : `หน้า ${currentPage + 1}`}
                        </span>
                        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </div>
                    {!searchTerm && (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={handlePrevPage} disabled={currentPage === 0 || loading}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> ก่อนหน้า
                            </Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleNextPage} disabled={isLastPage || loading}>
                                ถัดไป <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </div>
          </CardFooter>
      </Card>
    </>
  );
}
