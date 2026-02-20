"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Job, JobStatus, JobDepartment } from "@/lib/types";
import { safeFormat } from "@/lib/date-utils";
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  assigneeUid?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function JobList({ 
  department, 
  status,
  assigneeUid,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา"
}: JobListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!db) return;

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
      toast({ variant: "destructive", title: "Error", description: "Failed to load jobs." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, department, status, assigneeUid, toast]);

  const filteredJobs = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.filter(job =>
      (job.customerSnapshot?.name || "").toLowerCase().includes(q) ||
      (job.customerSnapshot?.phone || "").includes(q) ||
      (job.description || "").toLowerCase().includes(q)
    );
  }, [jobs, searchTerm]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  if (filteredJobs.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardHeader>
          <CardTitle>{emptyTitle}</CardTitle>
          <CardDescription>{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

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

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ลูกค้า</TableHead>
              <TableHead>แผนก</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>อัปเดตล่าสุด</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="font-medium">{job.customerSnapshot.name}</div>
                  <div className="text-xs text-muted-foreground">{job.customerSnapshot.phone}</div>
                </TableCell>
                <TableCell>{deptLabel(job.department)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{jobStatusLabel(job.status)}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {safeFormat(job.lastActivityAt, 'dd/MM/yy HH:mm')}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon">
                    <Link href={`/app/jobs/${job.id}`}><Eye className="h-4 w-4" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
