"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { collection, onSnapshot, query, type FirestoreError } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, PlusCircle, Search, FileImage, LayoutGrid, Table as TableIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Job, JobStatus } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Helper Functions
const isClosedStatus = (status?: Job['status']) => 
    ["CLOSED", "DONE", "COMPLETED"].includes(String(status || "").toUpperCase());

const getStatusVariant = (status: Job['status']) => {
  switch (status) {
    case 'RECEIVED': return 'secondary';
    case 'IN_PROGRESS': return 'default';
    case 'DONE': return 'outline';
    case 'CLOSED': return 'destructive';
    default: return 'outline';
  }
}

// Job Card for Grid/List views
function JobCard({ job }: { job: Job }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-video w-full bg-muted">
        {job.photos && job.photos.length > 0 ? (
            <Image
                src={job.photos[0]}
                alt={job.description || "Job image"}
                fill
                className="object-cover"
            />
        ) : (
            <div className="flex h-full w-full items-center justify-center">
                <FileImage className="h-10 w-10 text-muted-foreground/50" />
            </div>
        )}
      </div>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
          <Badge variant={getStatusVariant(job.status)} className={cn("flex-shrink-0", job.status === 'RECEIVED' && "animate-blink")}>{jobStatusLabel(job.status)}</Badge>
        </div>
        <CardDescription>
          {deptLabel(job.department)}
          <br />
          อัปเดตล่าสุด: {safeFormat(job.lastActivityAt, 'PP')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/app/jobs/${job.id}`}>
            ดูรายละเอียด <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// Compact Job Card for Board View
function CompactJobCard({ job }: { job: Job }) {
    return (
        <Card className="mb-2">
            <CardContent className="p-3">
                <div className="flex gap-3">
                    {job.photos && job.photos.length > 0 && (
                        <div className="relative w-16 h-16 rounded-md bg-muted flex-shrink-0">
                            <Image src={job.photos[0]} alt="Job" fill className="object-cover rounded-md" />
                        </div>
                    )}
                    <div className="flex-grow overflow-hidden">
                        <p className="font-semibold truncate">{job.customerSnapshot.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{job.customerSnapshot.phone}</p>
                        <p className="text-xs text-muted-foreground truncate">{job.description}</p>
                        <div className="flex justify-between items-center mt-1">
                            <Badge variant="outline" className="text-xs">{deptLabel(job.department)}</Badge>
                            <Button asChild size="sm" variant="ghost" className="h-auto px-2 py-1 text-xs">
                                <Link href={`/app/jobs/${job.id}`}>View</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Kanban Board Component
function JobsStatusBoard({ jobs }: { jobs: Job[] }) {
    const statusColumns: JobStatus[] = ['RECEIVED', 'IN_PROGRESS', 'WAITING_QUOTATION', 'WAITING_APPROVE', 'PENDING_PARTS', 'IN_REPAIR_PROCESS'];
    
    const jobsByStatus = useMemo(() => {
        const grouped: Record<string, Job[]> = {};
        jobs.forEach(job => {
            const statusKey = statusColumns.includes(job.status) ? job.status : 'OTHER';
            if (!grouped[statusKey]) grouped[statusKey] = [];
            grouped[statusKey].push(job);
        });
        
        for (const status in grouped) {
            grouped[status].sort((a, b) => (b.lastActivityAt?.toMillis() ?? 0) - (a.lastActivityAt?.toMillis() ?? 0));
        }
        return grouped;
    }, [jobs]);

    const allColumnKeys = [...statusColumns, ...(jobsByStatus['OTHER']?.length > 0 ? ['OTHER'] : [])];

    return (
        <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
                {allColumnKeys.map(statusKey => {
                    const columnJobs = jobsByStatus[statusKey] || [];
                    return (
                        <div key={statusKey} className="w-[320px] shrink-0">
                            <Card className="bg-muted/50 h-full flex flex-col">
                                <CardHeader className="p-4">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">{jobStatusLabel(statusKey as JobStatus) || statusKey}</CardTitle>
                                        <Badge variant="secondary">{columnJobs.length}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 flex-1 overflow-y-auto max-h-[calc(100vh-22rem)]">
                                    {columnJobs.length > 0 ? (
                                        columnJobs.map(job => <CompactJobCard key={job.id} job={job} />)
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">ไม่มีงาน</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    );
}

// Table View Component
function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map(job => (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="font-medium">{job.customerSnapshot.name}</div>
                  <div className="text-sm text-muted-foreground">{job.customerSnapshot.phone}</div>
                </TableCell>
                <TableCell>{deptLabel(job.department)}</TableCell>
                <TableCell className="max-w-xs truncate">{job.description}</TableCell>
                <TableCell><Badge variant={getStatusVariant(job.status)} className={cn(job.status === 'RECEIVED' && "animate-blink")}>{jobStatusLabel(job.status)}</Badge></TableCell>
                <TableCell>{safeFormat(job.lastActivityAt, 'dd MMM yy')}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/app/jobs/${job.id}`}>Details</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Main Page Component
export default function ManagementJobsPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [desktopView, setDesktopView] = useState<'table' | 'board'>('table');
    const { db } = useFirebase();
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        setLoading(true);
        const q = query(collection(db, "jobs"));
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
                setJobs(jobsData);
                setLoading(false);
            }, 
            (error: FirestoreError) => {
                toast({ variant: "destructive", title: "Error loading jobs", description: error.message });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [db, toast]);

    const visibleJobs = useMemo(() => {
        let openJobs = jobs.filter(j => !isClosedStatus(j.status));
        const q = searchTerm.trim().toLowerCase();
        if (q) {
            openJobs = openJobs.filter(j =>
                (j.customerSnapshot?.name || "").toLowerCase().includes(q) ||
                (j.customerSnapshot?.phone || "").includes(q)
            );
        }
        return openJobs;
    }, [jobs, searchTerm]);

    const renderContent = () => {
        if (loading) {
            return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
        }
        if (visibleJobs.length === 0) {
            return (
                <Card className="text-center py-12">
                    <CardHeader>
                        <CardTitle>{searchTerm ? 'ไม่พบงานที่ค้นหา' : 'ไม่มีงานที่กำลังดำเนินการ'}</CardTitle>
                    </CardHeader>
                </Card>
            )
        }
        return (
          <>
            {/* Desktop View */}
            <div className="hidden lg:block">
              {desktopView === 'table' ? <JobsTable jobs={visibleJobs} /> : <JobsStatusBoard jobs={visibleJobs} />}
            </div>
            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 lg:hidden">
              {visibleJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          </>
        );
    };

    return (
        <>
            <PageHeader title="ภาพรวมงานซ่อม" description="จัดการงานทั้งหมดในที่เดียว">
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="ค้นหาชื่อ/เบอร์โทร..."
                            className="w-full rounded-lg bg-background pl-8 sm:w-[250px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                     <div className="hidden lg:flex items-center gap-1 rounded-md bg-muted p-1">
                        <Button variant={desktopView === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDesktopView('table')}><TableIcon /> Table</Button>
                        <Button variant={desktopView === 'board' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDesktopView('board')}><LayoutGrid/> Board</Button>
                    </div>
                    <Button asChild>
                        <Link href="/app/office/intake">
                            <PlusCircle />
                            New Job
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <div className="space-y-4">
                {renderContent()}
            </div>
        </>
    );
}
