"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  startAfter,
  QueryDocumentSnapshot
} from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Eye, AlertCircle, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { safeFormat } from "@/lib/date-utils";
import { JobStatus, JobDepartment, Job } from "@/lib/types";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  excludeStatus?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  searchTerm?: string;
}

const getStatusVariant = (status: JobStatus) => {
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

export function JobList({
  department,
  status,
  excludeStatus,
  assigneeUid,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา",
  searchTerm: externalSearchTerm
}: JobListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(0);
  const pageStartCursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  const activeSearchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;

  const memoizedExcludeStatusArray = useMemo(() => {
    if (!excludeStatus) return [];
    return Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
  }, [excludeStatus]);

  const memoizedStatusArray = useMemo(() => {
    if (!status) return [];
    return Array.isArray(status) ? status : [status];
  }, [status]);

  const fetchData = useCallback(async (pageIndex: number) => {
    if (!db) return;

    setLoading(true);
    setError(null);

    try {
      const isSearch = !!activeSearchTerm.trim();
      
      const collectionRef = collection(db, "jobs");
      const constraints = [];

      if (department) {
        constraints.push(where("department", "==", department));
      }

      if (assigneeUid) {
        constraints.push(where("assigneeUid", "==", assigneeUid));
      }

      if (memoizedStatusArray.length > 0) {
        constraints.push(where("status", "in", memoizedStatusArray));
      } else if (memoizedExcludeStatusArray.length > 0) {
        constraints.push(where("status", "not-in", memoizedExcludeStatusArray));
      }

      constraints.push(orderBy("lastActivityAt", "desc"));

      if (!isSearch) {
        const cursor = pageStartCursors.current[pageIndex];
        if (cursor) {
          constraints.push(startAfter(cursor));
        }
        constraints.push(limit(10));
      } else {
        // If searching, fetch more to filter client-side
        constraints.push(limit(100));
      }

      const q = query(collectionRef, ...constraints);
      const snapshot = await getDocs(q);
      
      let fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

      if (isSearch) {
        const term = activeSearchTerm.toLowerCase();
        fetchedJobs = fetchedJobs.filter(job => 
          job.id.toLowerCase().includes(term) ||
          job.customerSnapshot.name.toLowerCase().includes(term) ||
          job.customerSnapshot.phone.includes(term) ||
          job.description.toLowerCase().includes(term)
        );
        setIsLastPage(true);
      } else {
        setIsLastPage(snapshot.docs.length < 10);
        if (snapshot.docs.length > 0) {
          pageStartCursors.current[pageIndex + 1] = snapshot.docs[snapshot.docs.length - 1];
        }
      }

      setJobs(fetchedJobs);
    } catch (err: any) {
      console.error("Error fetching jobs:", err);
      setError(err);
      if (err.message?.includes('requires an index')) {
        const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          setIndexCreationUrl(urlMatch[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [db, department, assigneeUid, memoizedStatusArray, memoizedExcludeStatusArray, activeSearchTerm]);

  useEffect(() => {
    setCurrentPage(0);
    pageStartCursors.current = [null];
    fetchData(0);
  }, [fetchData]);

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

  if (error) {
    return (
      <div className="text-center py-10 text-destructive border rounded-lg bg-destructive/5">
        <AlertCircle className="mx-auto h-10 w-10 mb-2" />
        <p className="font-medium">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
        <p className="text-sm opacity-80 mt-1">{error.message || ""}</p>
        {indexCreationUrl && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">ตัวกรองนี้ต้องใช้การสร้าง Index ในระบบฐานข้อมูล</p>
            <Button asChild variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-white">
              <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> คลิกที่นี่เพื่อสร้าง Index
              </a>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {externalSearchTerm === undefined && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาเลขที่จ๊อบ, ชื่อลูกค้า, หรือเบอร์โทร..."
            className="pl-10"
            value={internalSearchTerm}
            onChange={(e) => setInternalSearchTerm(e.target.value)}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Job ID</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>แผนก</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>อัปเดตล่าสุด</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="animate-spin h-8 w-8 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <p className="font-medium">{emptyTitle}</p>
                    <p className="text-sm">{emptyDescription}</p>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.id.substring(0, 8)}...</TableCell>
                    <TableCell>
                      <div className="font-medium">{job.customerSnapshot.name}</div>
                      <div className="text-xs text-muted-foreground">{job.customerSnapshot.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deptLabel(job.department)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(job.status)}>
                        {jobStatusLabel(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {safeFormat(job.lastActivityAt, "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon">
                        <Link href={`/app/jobs/${job.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        {!loading && jobs.length > 0 && (
          <CardFooter className="flex justify-between items-center py-4 border-t">
            <span className="text-sm text-muted-foreground">หน้า {currentPage + 1}</span>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 0}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={isLastPage}
              >
                ถัดไป
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
