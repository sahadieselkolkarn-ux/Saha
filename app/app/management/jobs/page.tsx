
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, PlusCircle, Search, FileImage } from "lucide-react";
import type { Job, JobDepartment } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_DEPARTMENTS, JOB_STATUS_DISPLAY } from "@/lib/constants";
import { JobList } from "@/components/job-list";

const isClosedStatus = (status?: Job['status']) => 
    ["CLOSED", "DONE", "COMPLETED"].includes(String(status || "").toUpperCase());

function AllJobsTab({ searchTerm }: { searchTerm: string }) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    };

    setLoading(true);
    const q = query(collection(db, "jobs"), orderBy("lastActivityAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
      setLoading(false);
    }, (error) => {
        toast({ variant: "destructive", title: "Error loading jobs", description: "Could not retrieve jobs from the database." });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [db, toast]);
  
  const visibleJobs = useMemo(() => {
    let filtered = jobs.filter(j => !isClosedStatus(j.status));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
        filtered = filtered.filter(j =>
            (j.customerSnapshot?.name || "").toLowerCase().includes(q) ||
            (j.customerSnapshot?.phone || "").includes(q)
        );
    }
    return filtered;
  }, [jobs, searchTerm]);
  
  const getStatusVariant = (status: Job['status']) => {
    switch (status) {
      case 'RECEIVED': return 'secondary';
      case 'IN_PROGRESS': return 'default';
      case 'DONE': return 'outline';
      case 'CLOSED': return 'destructive';
      default: return 'outline';
    }
  }

  return (
    <>
      {loading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
      ) : visibleJobs.length === 0 ? (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>{searchTerm ? "ไม่พบงานตามเงื่อนไขที่ค้นหา" : "No Ongoing Jobs Found"}</CardTitle>
                <CardDescription>{searchTerm ? "ลองเปลี่ยนคำค้นหาของคุณ" : "There are currently no active jobs."}</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <Link href="/app/office/intake">Create the first job</Link>
                </Button>
            </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleJobs.map(job => (
            <Card key={job.id} className="flex flex-col">
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
          ))}
        </div>
      )}
    </>
  );
}

function JobsByDepartmentTab() {
  const [selectedDepartment, setSelectedDepartment] = useState<JobDepartment | 'ALL'>('ALL');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-start">
            <Select onValueChange={(value) => setSelectedDepartment(value as JobDepartment | 'ALL')} defaultValue="ALL">
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="เลือกแผนกเพื่อกรองข้อมูล" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ทุกแผนก</SelectItem>
                {JOB_DEPARTMENTS.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      <JobList 
        department={selectedDepartment === 'ALL' ? undefined : selectedDepartment} 
        excludeStatus={["CLOSED", "DONE", "COMPLETED"]}
        emptyTitle={selectedDepartment === 'ALL' ? 'ไม่มีงานในระบบ' : `ไม่พบงานในแผนก ${selectedDepartment}`}
        emptyDescription="ลองเลือกแผนกอื่น หรือสร้างงานใหม่"
      />
    </div>
  )
}


export default function ManagementJobsPage() {
    const [searchTerm, setSearchTerm] = useState("");

    return (
        <>
            <PageHeader title="ภาพรวมงานซ่อม" description="จัดการงานทั้งหมดในที่เดียว">
                 <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="ค้นหาชื่อ/เบอร์โทร..."
                            className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[300px]"
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
            <Tabs defaultValue="all" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all">งานทั้งหมด</TabsTrigger>
                    <TabsTrigger value="by-department">แยกตามแผนก</TabsTrigger>
                    <TabsTrigger value="by-status">งานตามสถานะ</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    <AllJobsTab searchTerm={searchTerm}/>
                </TabsContent>
                <TabsContent value="by-department">
                    <JobsByDepartmentTab />
                </TabsContent>
                <TabsContent value="by-status">
                    <Card><CardHeader><CardTitle>งานตามสถานะ</CardTitle><CardDescription>ดูและจัดการงานทั้งหมดโดยแยกตามสถานะ</CardDescription></CardHeader><CardContent><p>Coming soon.</p></CardContent></Card>
                </TabsContent>
            </Tabs>
        </>
    );
}
