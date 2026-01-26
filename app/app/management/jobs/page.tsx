
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { collection, onSnapshot, query } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, PlusCircle, Search, FileImage } from "lucide-react";
import type { Job, JobStatus } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { JOB_STATUS_DISPLAY } from "@/lib/constants";

type DisplayMode = 'board' | 'listByStatus' | 'grid';

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

const statusColumns: JobStatus[] = ['RECEIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER_PICKUP', 'DONE'];

function JobCard({ job }: { job: Job }) {
  return (
    <Card className="flex flex-col">
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
          <Badge variant={getStatusVariant(job.status)} className="flex-shrink-0">{JOB_STATUS_DISPLAY[job.status]}</Badge>
        </div>
        <CardDescription>
          {job.department} &bull; Last update: {safeFormat(job.lastActivityAt, 'PP')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/app/jobs/${job.id}`}>
            View Details <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

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
                            <Badge variant="outline" className="text-xs">{job.department}</Badge>
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

function JobsByStatusBoard({ jobs }: { jobs: Job[] }) {
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
    
    const allColumnKeys = [...statusColumns, ...(jobsByStatus['OTHER'] ? ['OTHER'] : [])];

    return (
        <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
                {allColumnKeys.map(statusKey => {
                    const columnJobs = jobsByStatus[statusKey] || [];
                    return (
                        <div key={statusKey} className="w-[320px] flex-shrink-0">
                            <Card className="bg-muted/50 h-full flex flex-col">
                                <CardHeader className="p-4">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">{JOB_STATUS_DISPLAY[statusKey as JobStatus] || statusKey}</CardTitle>
                                        <Badge variant="secondary">{columnJobs.length}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 flex-1 overflow-y-auto max-h-[calc(100vh-20rem)]">
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

function JobsByStatusList({ jobs }: { jobs: Job[] }) {
    const [selectedStatus, setSelectedStatus] = useState<string>('RECEIVED');
    
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => job.status === selectedStatus);
    }, [jobs, selectedStatus]);

    return (
        <div className="space-y-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="เลือกสถานะ" />
                </SelectTrigger>
                <SelectContent>
                    {statusColumns.map(status => (
                        <SelectItem key={status} value={status}>{JOB_STATUS_DISPLAY[status]}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {filteredJobs.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredJobs.map(job => <JobCard key={job.id} job={job} />)}
                </div>
            ) : (
                <Card className="text-center py-12">
                    <CardHeader>
                        <CardTitle>ไม่มีงานในสถานะนี้</CardTitle>
                    </CardHeader>
                </Card>
            )}
        </div>
    );
}

function JobsGridView({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardHeader>
          <CardTitle>ไม่พบงานตามเงื่อนไขที่ค้นหา</CardTitle>
          <CardDescription>ลองเปลี่ยนคำค้นหาของคุณ</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {jobs.map(job => <JobCard key={job.id} job={job} />)}
    </div>
  );
}


export default function ManagementJobsPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [displayMode, setDisplayMode] = useState<DisplayMode>('board');
    const { db } = useFirebase();
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        setDisplayMode(isMobile ? 'listByStatus' : 'board');
    }, []);

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
            (error) => {
                toast({ variant: "destructive", title: "Error loading jobs" });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [db, toast]);

    const filteredJobs = useMemo(() => {
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

        switch(displayMode) {
            case 'board':
                return <JobsByStatusBoard jobs={filteredJobs} />;
            case 'listByStatus':
                return <JobsByStatusList jobs={filteredJobs} />;
            case 'grid':
                return <JobsGridView jobs={filteredJobs} />;
            default:
                return null;
        }
    }

    return (
        <>
            <PageHeader title="ภาพรวมงานซ่อม" description="จัดการงานทั้งหมดในที่เดียว">
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Select value={displayMode} onValueChange={(v) => setDisplayMode(v as DisplayMode)}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="board">บอร์ดงาน (หลายคอลัมน์)</SelectItem>
                            <SelectItem value="listByStatus">ดูทีละสถานะ</SelectItem>
                            <SelectItem value="grid">รายการแบบย่อ</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="ค้นหาชื่อ/เบอร์โทร..."
                            className="w-full rounded-lg bg-background pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button asChild>
                        <Link href="/app/office/intake">
                            <PlusCircle className="mr-2 h-4 w-4" />
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

    