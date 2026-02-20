"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  startAfter,
  endBefore,
  limitToLast,
  type OrderByDirection, 
  type QueryConstraint, 
  type FirestoreError,
  type QueryDocumentSnapshot
} from "firebase/firestore";
import { useFirebase, useAuth } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Eye, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "next/navigation";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
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
};

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
  
  const [currentPage, setCurrentPage] = useState(0);
  const pageStartCursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const memoizedExcludeStatusString = useMemo(() => {
    if (!excludeStatus) return "";
    return Array.isArray(excludeStatus) ? excludeStatus.join(',') : excludeStatus;
  }, [excludeStatus]);

  const fetchData = useCallback(async (pageIndex: number) => {
    if (!db) return;

    setLoading(true);
    setError(null);

    try {
      const isSearch = !!searchTerm.trim();
      const collectionName = source === 'archive' ? archiveCollectionNameByYear(year) : 'jobs';
      
      if (isSearch) {
        // Simple search logic: fetch a batch and filter
        const qConstraints: QueryConstraint[] = [];
        if (department) qConstraints.push(where('department', '==', department));
        if (status) qConstraints.push(where('status', '==', status));
        qConstraints.push(orderBy(orderByField, orderByDirection));
        qConstraints.push(limit(300)); // Large enough buffer for search

        const q = query(collection(db, collectionName), ...qConstraints);
        const snapshot = await getDocs(q);
        const allFetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
        
        const term = searchTerm.toLowerCase().trim();
        const filtered = allFetchedJobs.filter(j => 
          (j.customerSnapshot?.name || "").toLowerCase().includes(term) ||
          (j.customerSnapshot?.phone || "").includes(term) ||
          (j.description || "").toLowerCase().includes(term) ||
          (j.id && j.id.toLowerCase().includes(term))
        );

        setJobs(filtered.slice(0, limitProp));
        setIsLastPage(true);
      } else {
        // Paginated logic
        const qConstraints: QueryConstraint[] = [];
        if (department) qConstraints.push(where('department', '==', department));
        if (status) qConstraints.push(where('status', '==', status));
        if (memoizedExcludeStatusString) {
          qConstraints.push(where('status', 'not-in', memoizedExcludeStatusString.split(',')));
        }
        
        qConstraints.push(orderBy(orderByField, orderByDirection));
        
        const cursor = pageStartCursors.current[pageIndex];
        if (cursor) {
          qConstraints.push(startAfter(cursor));
        }
        qConstraints.push(limit(limitProp));

        const q = query(collection(db, collectionName), ...qConstraints);
        const snapshot = await getDocs(q);
        const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
        
        setJobs(jobsData);
        setIsLastPage(snapshot.docs.length < limitProp);
        
        // Save the last document as the cursor for the next page
        if (snapshot.docs.length > 0) {
          pageStartCursors.current[pageIndex + 1] = snapshot.docs[snapshot.docs.length - 1];
        }
      }
    } catch (err: any) {
      console.error("Error fetching jobs:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [db, source, year, department, status, orderByField, orderByDirection, limitProp, memoizedExcludeStatusString, searchTerm]);

  useEffect(() => {
    setCurrentPage(0);
    pageStartCursors.current = [null];
    fetchData(0);
  }, [searchTerm, status, department, memoizedExcludeStatusString, fetchData]);

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

  return (
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
                <TableHead className="text-right pr-6 py-4">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <Loader2 className="animate-spin h-8 w-8 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-destructive">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-8 w-8 opacity-20" />
                      <p>{searchTerm ? `ไม่พบข้อมูลที่ตรงกับ "${searchTerm}"` : emptyTitle}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map(job => (
                  <TableRow key={job.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-6 py-4">
                      <div className="font-semibold text-foreground">{job.customerSnapshot.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{job.customerSnapshot.phone}</div>
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
                    <TableCell className="text-right pr-6 whitespace-nowrap">
                      <Button asChild variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-sm" title="ดูรายละเอียด">
                        <a href={`/app/jobs/${job.id}`}><Eye className="h-4 w-4" /></a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {!searchTerm && !loading && (
        <CardFooter className="p-4 border-t bg-muted/5">
          <div className="flex w-full justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                หน้า {currentPage + 1}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={handlePrevPage} disabled={currentPage === 0 || loading}>
                <ChevronLeft className="h-4 w-4 mr-1" /> ก่อนหน้า
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={handleNextPage} disabled={isLastPage || loading}>
                ถัดไป <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}