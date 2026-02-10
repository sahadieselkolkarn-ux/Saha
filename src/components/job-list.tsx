"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, orderBy, type OrderByDirection, type QueryConstraint, type FirestoreError, doc, updateDoc, serverTimestamp, writeBatch, limit, getDocs, runTransaction, Timestamp, setDoc, deleteField } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Loader2, AlertCircle, ExternalLink, UserCheck, FileImage, Receipt, PackageCheck, Package, ExternalLink as ExternalLinkIcon, PlusCircle, Settings, Send, Clock, Eye } from "lucide-react";
import type { Job, JobStatus, JobDepartment, UserProfile, Document as DocumentType, AccountingAccount, Vendor } from "@/lib/types";
import { safeFormat } from '@/lib/date-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

interface JobListProps {
  department?: JobDepartment;
  status?: JobStatus | JobStatus[];
  excludeStatus?: JobStatus | JobStatus[];
  assigneeUid?: string;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
  limit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  children?: React.ReactNode;
  hideQuotationButton?: boolean;
  actionPreset?: 'default' | 'waitingApprove' | 'pendingPartsReady';
  searchTerm?: string;
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
  orderByField = "lastActivityAt",
  orderByDirection = "desc",
  limit: limitProp,
  emptyTitle = "ไม่พบรายการงาน",
  emptyDescription = "ขณะนี้ยังไม่มีงานที่ตรงกับเงื่อนไขการค้นหา",
  children,
  hideQuotationButton = false,
  actionPreset = 'default',
  searchTerm = "",
}: JobListProps) {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  
  const [indexState, setIndexState] = useState<'ok' | 'missing' | 'building'>('ok');
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [billingJob, setBillingJob] = useState<Job | null>(null);
  
  const isOfficeOrAdmin = profile?.department === 'OFFICE' || profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.department === 'MANAGEMENT';
  const isOfficer = isOfficeOrAdmin;

  const [assigningJob, setAssigningJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  
  const [jobForPartsReady, setJobForPartsReady] = useState<Job | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // State for the closing dialog (Submit to Review flow)
  const [closingJob, setClosingJob] = useState<Job | null>(null);
  const [isSubmittingToReview, setIsSubmittingToReview] = useState(false);
  const [relatedDocs, setRelatedDocs] = useState<DocumentType[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [accountingAccounts, setAccountingAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'PAID' | 'UNPAID'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [suggestedAccountId, setSuggestedAccountId] = useState<string>('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [pickupDate, setPickupDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentNotes, setPaymentNotes] = useState('');
  
  // State for outsourcing
  const [outsourcingJob, setOutsourcingJob] = useState<Job | null>(null);
  const [outsourceVendors, setOutsourceVendors] = useState<{id: string, name: string}[]>([]);
  const [isFetchingVendors, setIsFetchingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [outsourceNotes, setOutsourceNotes] = useState("");
  const [isLegacyOutsource, setIsLegacyOutsource] = useState(false);

  const jobsQuery = useMemo(() => {
    if (!db) return null;

    const constraints: QueryConstraint[] = [];
    
    if (assigneeUid) {
      constraints.push(where('assigneeUid', '==', assigneeUid));
    } else {
      if (department) {
        constraints.push(where('department', '==', department));
      }
      if (status && !Array.isArray(status)) {
        constraints.push(where('status', '==', status));
      }
      constraints.push(orderBy(orderByField, orderByDirection));

      if (limitProp) {
        constraints.push(limit(limitProp));
      }
    }

    return query(collection(db, 'jobs'), ...constraints);
  }, [db, department, Array.isArray(status) ? null : status, assigneeUid, orderByField, orderByDirection, retry, limitProp]);


  useEffect(() => {
    if (!jobsQuery) {
      setLoading(false);
      return;
    };

    setLoading(true);
    setError(null);
    setIndexState('ok');
    setIndexCreationUrl(null);

    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      let jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      if (assigneeUid) {
        if (department) {
            jobsData = jobsData.filter(job => job.department === department);
        }
        if (status) {
            const statuses = Array.isArray(status) ? status : [status];
            jobsData = jobsData.filter(job => statuses.includes(job.status));
        }
      } else {
        if (status && Array.isArray(status)) {
          jobsData = jobsData.filter(job => status.includes(job.status));
        }
      }
      
      if (excludeStatus) {
        const statusesToExclude = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
        jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
      }
      
      if (assigneeUid) {
        jobsData.sort((a, b) => {
            const timeA = a[orderByField as keyof Job] as Timestamp | undefined;
            const timeB = b[orderByField as keyof Job] as Timestamp | undefined;
            const valA = timeA?.toMillis() || 0;
            const valB = timeB?.toMillis() || 0;
            return orderByDirection === 'desc' ? valB - valA : valA - valB;
        });
      }

      setJobs(jobsData);
      setLoading(false);
      setError(null);
      setIndexState('ok');
    }, (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [jobsQuery, assigneeUid, department, status, excludeStatus, orderByField, orderByDirection]);

  const filteredJobs = useMemo(() => {
    if (!searchTerm) return jobs;
    const lowercasedTerm = searchTerm.toLowerCase();
    return jobs.filter(job =>
        (job.customerSnapshot?.name || "").toLowerCase().includes(lowercasedTerm) ||
        (job.customerSnapshot?.phone || "").includes(searchTerm) ||
        (job.description || "").toLowerCase().includes(lowercasedTerm) ||
        (job.carServiceDetails?.licensePlate || "").toLowerCase().includes(lowercasedTerm)
    );
  }, [jobs, searchTerm]);

  useEffect(() => {
    if (error?.message?.includes('requires an index')) {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        setIndexCreationUrl(urlMatch[0]);
      }
      if (error.message.includes('currently building')) {
        setIndexState('building');
        const timer = setTimeout(() => setRetry(r => r + 1), 10000); 
        return () => clearTimeout(timer);
      } else {
        setIndexState('missing');
      }
    } else {
      setIndexState('ok');
      setIndexCreationUrl(null);
    }
  }, [error]);
  
  const handleOpenCloseDialog = async (job: Job) => {
    if (!db) return;
    setClosingJob(job);
    setPickupDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedDocId('');
    setPaymentMode('UNPAID');

    setIsLoadingDocs(true);
    try {
        const docsQuery = query(collection(db, "documents"), where("jobId", "==", job.id));
        const docsSnapshot = await getDocs(docsQuery);
        const fetchedDocs = docsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as DocumentType))
            .filter(d => d.docType === 'DELIVERY_NOTE' || d.docType === 'TAX_INVOICE');
        
        fetchedDocs.sort((a, b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime());
        setRelatedDocs(fetchedDocs);

        if (fetchedDocs.length > 0) {
            setSelectedDocId(fetchedDocs[0].id);
        }
    } catch(e) {
        toast({ variant: 'destructive', title: 'ไม่สามารถโหลดข้อมูลเอกสารได้' });
    } finally {
        setIsLoadingDocs(false);
    }

    setIsLoadingAccounts(true);
    try {
        const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        const accountsSnapshot = await getDocs(accountsQuery);
        const fetchedAccounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data()} as AccountingAccount));
        setAccountingAccounts(fetchedAccounts);
        if(fetchedAccounts.length > 0) {
            const defaultAcc = fetchedAccounts.find(a => a.type === 'CASH') || fetchedAccounts[0];
            setSuggestedAccountId(defaultAcc.id);
        }
    } catch (e) {
        toast({ variant: 'destructive', title: 'ไม่สามารถโหลดข้อมูลบัญชีได้' });
    } finally {
        setIsLoadingAccounts(false);
    }
  };

  const handleCloseJob = async () => {
    if (!db || !profile || !closingJob || !selectedDocId) {
      toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: 'กรุณาเลือกเอกสารอ้างอิงให้ถูกต้อง'});
      return;
    }

    const selectedDoc = relatedDocs.find(d => d.id === selectedDocId);
    if (!selectedDoc) {
      toast({ variant: 'destructive', title: 'ไม่พบเอกสาร', description: 'ไม่พบเอกสารขายที่เลือกในระบบ'});
      return;
    }
    
    setIsSubmittingToReview(true);
    try {
        const batch = writeBatch(db);
        const docRefToUpdate = doc(db, 'documents', selectedDoc.id);
        const jobRef = doc(db, 'jobs', closingJob.id);
        const activityRef = doc(collection(db, 'jobs', closingJob.id, 'activities'));
        
        const docUpdate: any = {
            status: 'PENDING_REVIEW',
            arStatus: 'PENDING',
            updatedAt: serverTimestamp()
        };

        if (paymentMode === 'PAID') {
            docUpdate.paymentTerms = 'CASH';
            docUpdate.suggestedAccountId = suggestedAccountId;
            docUpdate.suggestedPaymentMethod = paymentMethod;
        } else {
            docUpdate.paymentTerms = 'CREDIT';
            docUpdate.dueDate = creditDueDate || null;
        }
        batch.update(docRefToUpdate, docUpdate);

        const salesDocInfo = {
            salesDocType: selectedDoc.docType,
            salesDocId: selectedDoc.id,
            salesDocNo: selectedDoc.docNo,
            paymentStatusAtClose: 'UNPAID'
        };

        batch.update(jobRef, {
            ...salesDocInfo,
            status: 'WAITING_CUSTOMER_PICKUP',
            pickupDate: pickupDate,
            lastActivityAt: serverTimestamp(),
        });

        batch.set(activityRef, {
            text: `ส่งตรวจสอบรายการขาย (${selectedDoc.docNo}) และเตรียมส่งมอบงาน. แผนกบัญชีสามารถตรวจสอบและกดยืนยันเพื่อปิดงานได้`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
        });

        await batch.commit();

        toast({ title: 'ส่งตรวจสอบรายการขายสำเร็จ', description: 'ส่งรายการไปที่ Inbox บัญชีเรียบร้อยแล้ว' });
        setClosingJob(null);
    } catch (error: any) {
        console.error("Submit review failed:", error);
        toast({ variant: 'destructive', title: 'ส่งตรวจสอบไม่สำเร็จ', description: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
    } finally {
        setIsSubmittingToReview(false);
    }
  }


  const handleAcceptJob = async (jobId: string) => {
    if (!db || !profile) {
      toast({ variant: "destructive", title: "ไม่สามารถรับงานได้", description: "ไม่พบข้อมูลผู้ใช้ของคุณ" });
      return;
    };
    
    setIsAccepting(jobId);
    try {
        const jobDocRef = doc(db, "jobs", jobId);
        
        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบงานที่ต้องการรับในระบบ");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("งานนี้ไม่ได้อยู่ในสถานะรอรับงานแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกพนักงานท่านอื่นรับไปแล้ว");
            }
            
            if (profile.role !== 'MANAGER' && profile.role !== 'ADMIN' && profile.department !== jobData.department) {
                throw new Error("คุณไม่ได้อยู่ในแผนกที่รับผิดชอบงานนี้");
            }

            transaction.update(jobDocRef, {
                status: "IN_PROGRESS",
                assigneeUid: profile.uid,
                assigneeName: profile.displayName,
                lastActivityAt: serverTimestamp(),
            });

            const activityDocRef = doc(collection(db, "jobs", jobId, "activities"));
            transaction.set(activityDocRef, {
                text: `รับงานเข้าดำเนินการ`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        });

        toast({ title: "รับงานสำเร็จ", description: "งานนี้อยู่ในความรับผิดชอบของคุณแล้ว" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "การรับงานล้มเหลว", description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };

  const openAssignDialog = async (job: Job) => {
    if (!db) return;
    setAssigningJob(job);
    setSelectedWorkerId(null);
    setIsFetchingWorkers(true);
    try {
      const workersQuery = query(
        collection(db, "users"),
        where("department", "==", job.department),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const querySnapshot = await getDocs(workersQuery);
      const fetchedWorkers = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setWorkers(fetchedWorkers);
    } catch (error) {
        toast({ variant: 'destructive', title: 'ไม่สามารถดึงรายชื่อพนักงานได้' });
        setWorkers([]);
    } finally {
        setIsFetchingWorkers(false);
    }
  };
  
  const openOutsourceDialog = async (job: Job) => {
    if (!db) return;
    setOutsourcingJob(job);
    setSelectedVendorId(null);
    setOutsourceNotes("");
    setIsFetchingVendors(true);
    setIsLegacyOutsource(false);

    try {
        const vendorsQuery = query(
            collection(db, "vendors"),
            orderBy("companyName", "asc")
        );
        
        let fetchedFromNewSystem = false;
        try {
            const querySnapshot = await getDocs(vendorsQuery);
            const contractors = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Vendor))
                .filter(v => v.isActive && v.vendorType === 'CONTRACTOR');

            if (contractors.length > 0) {
                setOutsourceVendors(contractors.map(v => ({ id: v.id, name: v.companyName })));
                fetchedFromNewSystem = true;
            }
        } catch (e) {
            console.warn("New vendors system query failed, falling back:", e);
        }
        
        if (!fetchedFromNewSystem) {
            const legacyQuery = query(
                collection(db, "outsourceVendors"),
                where("isActive", "==", true),
                orderBy("shopName", "asc")
            );
            const legacySnap = await getDocs(legacyQuery);
            if (!legacySnap.empty) {
                setIsLegacyOutsource(true);
                setOutsourceVendors(legacySnap.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().shopName
                })));
            } else {
                setOutsourceVendors([]);
            }
        }
    } catch (error: any) {
        console.error("Error fetching outsource vendors:", error);
        toast({ variant: 'destructive', title: 'ไม่สามารถโหลดรายชื่อผู้รับเหมาได้', description: "กรุณาลองใหม่อีกครั้ง" });
        setOutsourceVendors([]);
    } finally {
        setIsFetchingVendors(false);
    }
  };
  
  const handleConfirmOutsource = async () => {
    if (!db || !profile || !outsourcingJob || !selectedVendorId) {
        toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน", description: "กรุณาเลือกร้านผู้รับเหมา" });
        return;
    }
    
    const selectedVendor = outsourceVendors.find(v => v.id === selectedVendorId);
    if (!selectedVendor) {
        toast({ variant: "destructive", title: "ไม่พบข้อมูลร้านผู้รับเหมา" });
        return;
    }

    setIsAccepting(outsourcingJob.id);
    try {
        const batch = writeBatch(db);
        const jobRef = doc(db, 'jobs', outsourcingJob.id);
        const activityRef = doc(collection(db, 'jobs', outsourcingJob.id, 'activities'));

        batch.update(jobRef, {
            department: 'OUTSOURCE',
            status: 'IN_PROGRESS',
            assigneeUid: selectedVendor.id,
            assigneeName: selectedVendor.name,
            lastActivityAt: serverTimestamp(),
        });

        const activityText = `มอบหมายงานนอก/ผู้รับเหมา: ${selectedVendor.name}. หมายเหตุ: ${outsourceNotes || 'ไม่มี'}`;
        batch.set(activityRef, {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();
        toast({ title: 'ส่งมอบหมายงานนอกสำเร็จ' });
        setOutsourcingJob(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'การมอบหมายงานนอกล้มเหลว', description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!db || !profile || !assigningJob || !selectedWorkerId) return;
    
    const selectedWorker = workers.find(w => w.uid === selectedWorkerId);
    if (!selectedWorker) {
        toast({ variant: "destructive", title: "ไม่พบข้อมูลพนักงาน" });
        return;
    }

    setIsAccepting(assigningJob.id);
    try {
        const jobDocRef = doc(db, "jobs", assigningJob.id);

        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบข้อมูลงานในระบบ");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("งานนี้ไม่ได้อยู่ในสถานะรอรับงานแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกพนักงานท่านอื่นรับไปแล้ว");
            }

            transaction.update(jobDocRef, {
                status: "IN_PROGRESS",
                assigneeUid: selectedWorker.uid,
                assigneeName: selectedWorker.displayName,
                lastActivityAt: serverTimestamp(),
            });

            const activityDocRef = doc(collection(db, "jobs", assigningJob.id, "activities"));
            transaction.set(activityDocRef, {
                text: `มอบหมายงานให้ ${selectedWorker.displayName}`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        });

        toast({ title: "มอบหมายงานสำเร็จ", description: `งานถูกมอบหมายให้ ${selectedWorker.displayName} เรียบร้อยแล้ว` });
        setAssigningJob(null);
    } catch (error: any) {
        toast({ variant: "destructive", title: "การมอบหมายงานล้มเหลว", description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };
  
  const handleConfirmPartsReady = async () => {
    if (!db || !profile || !jobForPartsReady) return;
    setIsActionLoading(true);
    try {
        const batch = writeBatch(db);
        const jobRef = doc(db, 'jobs', jobForPartsReady.id);
        const activityRef = doc(collection(db, 'jobs', jobForPartsReady.id, 'activities'));

        batch.update(jobRef, {
            status: 'IN_REPAIR_PROCESS',
            lastActivityAt: serverTimestamp(),
        });

        batch.set(activityRef, {
            text: `จัดอะไหล่เรียบร้อยแล้ว แจ้งแผนกต้นทางให้ดำเนินการเบิกอะไหล่และซ่อมได้`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
        });
        
        await batch.commit();
        toast({ title: 'อัปเดตสถานะเรียบร้อย' });
        setJobForPartsReady(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'การอัปเดตล้มเหลว', description: error.message });
    } finally {
        setIsActionLoading(false);
    }
  };

  if (loading) {
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
                    ฐานข้อมูลต้องการ Index เพื่อกรองและเรียงข้อมูล
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
  
  if (error) {
       return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <CardTitle>ไม่สามารถโหลดข้อมูลงานได้</CardTitle>
                <CardDescription>{error.message}</CardDescription>
            </CardHeader>
        </Card>
       );
  }

  if (filteredJobs.length === 0) {
     return (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>{searchTerm ? 'ไม่พบงานที่ตรงกับการค้นหา' : emptyTitle}</CardTitle>
                <CardDescription>{searchTerm ? 'กรุณาลองระบุคำค้นหาอื่น' : emptyDescription}</CardDescription>
            </CardHeader>
            {children && <CardContent>{children}</CardContent>}
        </Card>
     );
  }

  return (
    <>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredJobs.map(job => {
        const isBilled = !!job.salesDocId;
        const isSubmitted = job.status === 'WAITING_CUSTOMER_PICKUP' || job.status === 'CLOSED';
        const isEffectivelyLocked = isSubmitted || job.isArchived;

        return (
          <Card key={job.id} className="flex flex-col overflow-hidden">
            <div className="relative aspect-[16/10] w-full bg-muted">
              {job.photos && job.photos.length > 0 ? (
                  <Image
                      src={job.photos[0]}
                      alt={job.description || "รูปภาพประกอบงาน"}
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
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-lg font-bold line-clamp-1">{job.customerSnapshot.name}</CardTitle>
                <Badge variant={getStatusVariant(job.status)} className={cn("flex-shrink-0 whitespace-nowrap", job.status === 'RECEIVED' && "animate-blink")}>{jobStatusLabel(job.status)}</Badge>
              </div>
              <CardDescription>
                {deptLabel(job.department)}
                {job.assigneeName && <span className="font-medium"> • {job.assigneeName}</span>}
                <br />
                อัปเดตล่าสุด: {safeFormat(job.lastActivityAt, 'PP')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
              {isBilled && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-primary">
                  <Receipt className="h-3 w-3" />
                  บิล: {job.salesDocNo}
                </div>
              )}
              {job.status === 'WAITING_CUSTOMER_PICKUP' && (
                <Badge variant="secondary" className="mt-2 w-full justify-center bg-blue-50 text-blue-700 border-blue-200">
                  <Clock className="mr-1 h-3 w-3" /> รอตรวจสอบบัญชี
                </Badge>
              )}
            </CardContent>
            <CardFooter className={cn(
              "mt-auto grid gap-2 p-4",
              (job.status === 'RECEIVED' && (profile?.department === job.department || isOfficeOrAdmin)) ? 'grid-cols-2' :
              (actionPreset === 'pendingPartsReady' && job.status === 'PENDING_PARTS') || isEffectivelyLocked
                ? 'grid-cols-1'
                : (job.status === 'WAITING_QUOTATION' || job.status === 'WAITING_APPROVE' || job.status === 'DONE') ? "grid-cols-2" : "grid-cols-1"
            )}>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/app/jobs/${job.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>

              {!isEffectivelyLocked && (
                <>
                  {actionPreset === 'pendingPartsReady' && job.status === 'PENDING_PARTS' && isOfficeOrAdmin && (
                      <Button variant="default" className="w-full" onClick={() => setJobForPartsReady(job)}>
                          <PackageCheck className="mr-2 h-4 w-4" />
                          จัดอะไหล่เรียบร้อย
                      </Button>
                  )}
                  
                  {job.status === 'RECEIVED' && (profile?.department === job.department || isOfficeOrAdmin) && (
                    <>
                    {job.department === 'OUTSOURCE' ? (
                        <Button
                            variant="default"
                            className="w-full"
                            onClick={() => openOutsourceDialog(job)}
                            disabled={isAccepting !== null}
                        >
                            {isAccepting === job.id ? <Loader2 className="animate-spin" /> : <Package />}
                            มอบหมายร้านนอก
                        </Button>
                    ) : (
                        <Button 
                          variant="default" 
                          className="w-full"
                          onClick={() => isOfficer ? openAssignDialog(job) : handleAcceptJob(job.id)}
                          disabled={isAccepting !== null}
                        >
                          {isAccepting === job.id ? <Loader2 className="animate-spin" /> : <UserCheck />}
                          {isOfficer ? 'มอบหมายงาน' : 'รับงาน'}
                        </Button>
                    )}
                    </>
                  )}

                  {(job.status === 'WAITING_QUOTATION' || job.status === 'WAITING_APPROVE') && !hideQuotationButton && (
                    <Button asChild variant="default" className="w-full">
                      <Link href={`/app/office/documents/quotation/new?jobId=${job.id}`}>
                        <Receipt />
                        ทำใบเสนอราคา
                      </Link>
                    </Button>
                  )}

                  {job.status === 'DONE' && isOfficeOrAdmin && (
                    <>
                      {!isBilled ? (
                        <Button
                          variant="default"
                          className="w-full"
                          onClick={() => setBillingJob(job)}
                        >
                          <Receipt />
                          ออกบิล
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          className="w-full"
                          onClick={() => handleOpenCloseDialog(job)}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          ส่งมอบงาน
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
    <Dialog open={!!assigningJob} onOpenChange={(isOpen) => { if (!isOpen) setAssigningJob(null) }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>มอบหมายงาน</DialogTitle>
                <DialogDescription>
                    เลือกพนักงานเพื่อรับผิดชอบงานซ่อมนี้
                </DialogDescription>
            </DialogHeader>
            {isFetchingWorkers ? (
                <div className="flex justify-center items-center h-24">
                    <Loader2 className="animate-spin" />
                </div>
            ) : workers.length > 0 ? (
                <div className="py-4">
                    <Select onValueChange={setSelectedWorkerId} value={selectedWorkerId || ""}>
                        <SelectTrigger>
                            <SelectValue placeholder="เลือกพนักงาน..." />
                        </SelectTrigger>
                        <SelectContent>
                            {workers.map(worker => (
                                <SelectItem key={worker.uid} value={worker.uid}>
                                    {worker.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <p className="py-4 text-center text-muted-foreground">ไม่พบรายชื่อพนักงานที่มีสถานะปกติในแผนกนี้</p>
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setAssigningJob(null)}>ยกเลิก</Button>
                <Button onClick={handleConfirmAssignment} disabled={!selectedWorkerId || isAccepting !== null}>
                    {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันการมอบหมาย
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <AlertDialog open={!!billingJob} onOpenChange={(isOpen) => !isOpen && setBillingJob(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>เลือกประเภทเอกสาร</AlertDialogTitle>
                <AlertDialogDescription>
                    กรุณาเลือกประเภทเอกสารที่ต้องการออกสำหรับงานซ่อมนี้
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <Button variant="outline" onClick={() => setBillingJob(null)}>ยกเลิก</Button>
                <Button variant="secondary" onClick={() => {
                    if (billingJob) router.push(`/app/office/documents/delivery-note/new?jobId=${billingJob.id}`);
                    setBillingJob(null);
                }}>
                    ใบส่งของชั่วคราว
                </Button>
                <Button onClick={() => {
                    if (billingJob) router.push(`/app/office/documents/tax-invoice/new?jobId=${billingJob.id}`);
                    setBillingJob(null);
                }}>
                    ใบกำกับภาษี
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
     <Dialog open={!!closingJob} onOpenChange={(isOpen) => !isOpen && setClosingJob(null)}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>ส่งมอบงานให้ลูกค้า</DialogTitle>
                <DialogDescription>
                    ขั้นตอนนี้เป็นการส่งรายการตรวจสอบบิลไปที่แผนกบัญชีเพื่อเตรียมการรับเงิน
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div>
                    <Label htmlFor="salesDoc">1. เลือกเอกสารขายที่อ้างอิง</Label>
                    {isLoadingDocs ? <Loader2 className="animate-spin"/> : (
                        relatedDocs.length > 0 ? (
                            <Select onValueChange={setSelectedDocId} value={selectedDocId}>
                                <SelectTrigger id="salesDoc" className="mt-1"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                {relatedDocs.map(doc => (
                                    <SelectItem key={doc.id} value={doc.id}>
                                        {doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'} {doc.docNo} - ยอด {doc.grandTotal.toLocaleString()} บาท
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                        ) : <p className="text-sm text-destructive p-2 bg-destructive/10 rounded-md mt-1">ไม่พบเอกสารขาย กรุณาออกบิลก่อนส่งตรวจสอบ</p>
                    )}
                </div>
                
                {paymentMode === 'PAID' && (
                    <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>ช่องทางที่รับเงิน</Label>
                                <Select value={paymentMethod} onValueChange={setPaymentMethod as any}>
                                    <SelectTrigger className="bg-background"><SelectValue/></SelectTrigger>
                                    <SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">เงินโอน</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>บัญชีที่รับเงิน</Label>
                                {isLoadingAccounts ? <Loader2 className="animate-spin h-4 w-4"/> : (
                                    <Select value={suggestedAccountId} onValueChange={setSuggestedAccountId}>
                                        <SelectTrigger className="bg-background"><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger>
                                        <SelectContent>
                                            {accountingAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                 {paymentMode === 'UNPAID' && (
                    <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                        <Label htmlFor="creditDueDate">วันครบกำหนดชำระ (ถ้ามี)</Label>
                        <Input id="creditDueDate" type="date" value={creditDueDate} onChange={(e) => setCreditDueDate(e.target.value)} className="bg-background"/>
                    </div>
                 )}
                <div>
                    <Label htmlFor="pickupDate">2. วันที่ส่งมอบจริง</Label>
                    <Input id="pickupDate" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1" />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setClosingJob(null)} disabled={isSubmittingToReview}>ยกเลิก</Button>
                <Button onClick={handleCloseJob} disabled={isSubmittingToReview || isLoadingDocs || !selectedDocId}>
                    {isSubmittingToReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ส่งบัญชีตรวจสอบ
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <AlertDialog open={!!jobForPartsReady} onOpenChange={(isOpen) => !isOpen && setJobForPartsReady(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการจัดอะไหล่</AlertDialogTitle>
                <AlertDialogDescription>
                    คุณต้องการยืนยันว่าจัดอะไหล่สำหรับงานของ "{jobForPartsReady?.customerSnapshot.name}" เรียบร้อยแล้วหรือไม่? สถานะจะเปลี่ยนเป็น "กำลังดำเนินการซ่อม"
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isActionLoading}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmPartsReady} disabled={isActionLoading}>
                    {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : 'ยืนยัน'}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
     <Dialog open={!!outsourcingJob} onOpenChange={(isOpen) => { if (!isOpen) setOutsourcingJob(null) }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>มอบหมายผู้รับเหมา/งานนอก</DialogTitle>
                <DialogDescription>
                    เลือกรายชื่อผู้รับเหมา และกรอกรายละเอียดการส่งงาน
                </DialogDescription>
            </DialogHeader>
            {isFetchingVendors ? (
                <div className="flex justify-center items-center h-24">
                    <Loader2 className="animate-spin" />
                </div>
            ) : outsourceVendors.length > 0 ? (
                <div className="py-4 space-y-4">
                    {isLegacyOutsource && (
                        <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-xs">ย้ายข้อมูลรายชื่อ</AlertTitle>
                            <AlertDescription className="text-[10px]">ยังไม่ย้ายรายชื่อผู้รับเหมามาอยู่ในเมนูร้านค้า (Vendors)</AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="outsource-vendor">เลือกผู้รับเหมา/ร้านนอก</Label>
                        <Select onValueChange={setSelectedVendorId} value={selectedVendorId || ""}>
                            <SelectTrigger id="outsource-vendor">
                                <SelectValue placeholder="เลือกรายชื่อผู้รับเหมา..." />
                            </SelectTrigger>
                            <SelectContent>
                                {outsourceVendors.map(vendor => (
                                    <SelectItem key={vendor.id} value={vendor.id}>
                                        {vendor.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="outsource-notes">หมายเหตุการส่งงาน (เช่น วันนัดรับ)</Label>
                        <Textarea id="outsource-notes" value={outsourceNotes} onChange={e => setOutsourceNotes(e.target.value)} placeholder="เช่น งานด่วน, รอรับวันไหน, อาการเพิ่มเติม..." />
                    </div>
                </div>
            ) : (
                <div className="py-6 text-center space-y-4">
                    <p className="text-sm text-muted-foreground">ยังไม่มีรายชื่อผู้รับเหมาในระบบ</p>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/app/office/parts/vendors?type=CONTRACTOR">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            ไปเพิ่มรายชื่อผู้รับเหมา
                        </Link>
                    </Button>
                </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
                <div className="flex-1">
                    {outsourceVendors.length > 0 && (
                        <Button asChild variant="link" size="sm" className="px-0">
                            <Link href="/app/office/parts/vendors?type=CONTRACTOR" className="flex items-center">
                                <Settings className="mr-1 h-3 w-3" /> จัดการรายชื่อผู้รับเหมา
                            </Link>
                        </Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setOutsourcingJob(null)}>ยกเลิก</Button>
                    <Button onClick={handleConfirmOutsource} disabled={!selectedVendorId || isAccepting !== null}>
                        {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        ยืนยันการมอบหมาย
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
