

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, orderBy, OrderByDirection, QueryConstraint, FirestoreError, doc, updateDoc, serverTimestamp, writeBatch, limit, getDocs, runTransaction, Timestamp, setDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, AlertCircle, ExternalLink, UserCheck, FileImage, Receipt, PackageCheck, Package } from "lucide-react";
import type { Job, JobStatus, JobDepartment, UserProfile, Document as DocumentType, AccountingAccount, OutsourceVendor } from "@/lib/types";
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
import { archiveAndCloseJob } from "@/firebase/jobs-archive";
import { ensurePaymentClaimForDocument } from "@/firebase/payment-claims";

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
  emptyTitle = "No Jobs Found",
  emptyDescription = "There are no jobs that match the current criteria.",
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
  
  const isOfficer = profile?.role === 'OFFICER';
  const isOfficeOrAdmin = profile?.department === 'OFFICE' || profile?.role === 'ADMIN';
  const [assigningJob, setAssigningJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  
  const [jobForPartsReady, setJobForPartsReady] = useState<Job | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // State for the closing dialog
  const [closingJob, setClosingJob] = useState<Job | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [relatedDocs, setRelatedDocs] = useState<DocumentType[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [accountingAccounts, setAccountingAccounts] = useState<AccountingAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'PAID' | 'UNPAID'>('PAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [suggestedAccountId, setSuggestedAccountId] = useState<string>('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [pickupDate, setPickupDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentNotes, setPaymentNotes] = useState('');
  
  const [outsourcingJob, setOutsourcingJob] = useState<Job | null>(null);
  const [outsourceVendors, setOutsourceVendors] = useState<OutsourceVendor[]>([]);
  const [isFetchingVendors, setIsFetchingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [outsourceNotes, setOutsourceNotes] = useState("");

  const jobsQuery = useMemo(() => {
    if (!db) return null;

    const constraints: QueryConstraint[] = [];
    
    // If assigneeUid is present, query only by it to avoid composite index requirement.
    // Other filtering and sorting will happen on the client-side.
    if (assigneeUid) {
      constraints.push(where('assigneeUid', '==', assigneeUid));
    } else {
      // Original logic for other list views
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
      
      // Client-side filtering logic
      if (assigneeUid) {
        // This query was only by assigneeUid, so we must apply other filters now.
        if (department) {
            jobsData = jobsData.filter(job => job.department === department);
        }
        if (status) {
            const statuses = Array.isArray(status) ? status : [status];
            jobsData = jobsData.filter(job => statuses.includes(job.status));
        }
      } else {
        // This was the original logic for queries that didn't use assigneeUid
        if (status && Array.isArray(status)) {
          jobsData = jobsData.filter(job => status.includes(job.status));
        }
      }
      
      if (excludeStatus) {
        const statusesToExclude = Array.isArray(excludeStatus) ? excludeStatus : [excludeStatus];
        jobsData = jobsData.filter(job => !statusesToExclude.includes(job.status));
      }
      
      // Client-side sorting if we didn't use orderBy in the query
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
  }, [jobsQuery, assigneeUid, department, JSON.stringify(status), JSON.stringify(excludeStatus), orderByField, orderByDirection]);

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
    setPaymentMode('PAID');

    // Fetch related documents
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
        toast({ variant: 'destructive', title: 'Error fetching documents' });
    } finally {
        setIsLoadingDocs(false);
    }

    // Fetch accounting accounts
    setIsLoadingAccounts(true);
    try {
        const accountsQuery = query(collection(db, "accountingAccounts"), where("isActive", "==", true));
        const accountsSnapshot = await getDocs(accountsQuery);
        const fetchedAccounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data()} as AccountingAccount));
        setAccountingAccounts(fetchedAccounts);
        if(fetchedAccounts.length > 0) {
            setSuggestedAccountId(fetchedAccounts[0].id);
        }
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error fetching accounts' });
    } finally {
        setIsLoadingAccounts(false);
    }
  };

  const handleCloseJob = async () => {
    if (!db || !profile || !closingJob || !selectedDocId) {
      toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: 'กรุณาเลือกเอกสารขาย'});
      return;
    }

    const selectedDoc = relatedDocs.find(d => d.id === selectedDocId);
    if (!selectedDoc) {
      toast({ variant: 'destructive', title: 'ไม่พบเอกสาร', description: 'ไม่พบเอกสารขายที่เลือก'});
      return;
    }

    if (paymentMode === 'PAID' && !suggestedAccountId) {
        toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: 'กรุณาเลือกบัญชีที่คาดว่าจะเข้า'});
        return;
    }
    
    setIsClosing(true);
    try {
        if (paymentMode === 'PAID') {
            await ensurePaymentClaimForDocument(
                db,
                selectedDoc.id,
                profile,
                {
                    suggestedPaymentMethod: paymentMethod,
                    suggestedAccountId: suggestedAccountId,
                    note: paymentNotes || 'ส่งมอบงานแล้ว รอตรวจสอบรายรับ',
                }
            );
        } else { // UNPAID / CREDIT
            const arRef = doc(collection(db, 'accountingObligations'));
            const arData = {
                type: 'AR',
                status: 'UNPAID',
                jobId: closingJob.id,
                sourceDocType: selectedDoc.docType,
                sourceDocId: selectedDoc.id,
                sourceDocNo: selectedDoc.docNo,
                amountTotal: selectedDoc.grandTotal,
                amountPaid: 0,
                balance: selectedDoc.grandTotal,
                customerNameSnapshot: closingJob.customerSnapshot.name,
                customerPhoneSnapshot: closingJob.customerSnapshot.phone,
                dueDate: creditDueDate || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await setDoc(arRef, arData);
        }

        if (selectedDoc.status === 'DRAFT') {
            const docRefToUpdate = doc(db, 'documents', selectedDoc.id);
            await updateDoc(docRefToUpdate, { status: 'PENDING_REVIEW', updatedAt: serverTimestamp() });
        }
        
        const salesDocInfo = {
            salesDocType: selectedDoc.docType,
            salesDocId: selectedDoc.id,
            salesDocNo: selectedDoc.docNo,
            paymentStatusAtClose: paymentMode
        };

        await archiveAndCloseJob(db, closingJob.id, pickupDate, profile, salesDocInfo);

        toast({ title: 'ปิดงานและย้ายไปที่ประวัติสำเร็จ' });
        setClosingJob(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'ปิดงานไม่สำเร็จ', description: error.message });
    } finally {
        setIsClosing(false);
    }
  }


  const handleAcceptJob = async (jobId: string) => {
    if (!db || !profile) {
      toast({ variant: "destructive", title: "ไม่สามารถรับงานได้", description: "ไม่พบข้อมูลผู้ใช้" });
      return;
    };
    
    setIsAccepting(jobId);
    try {
        const jobDocRef = doc(db, "jobs", jobId);
        
        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบงานที่ต้องการรับ");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("ไม่สามารถรับงานได้ เพราะสถานะเปลี่ยนไปแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกผู้อื่นรับไปแล้ว");
            }
            
            if (profile.department !== jobData.department) {
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

        toast({ title: "รับงานสำเร็จ", description: "งานนี้ถูกมอบหมายให้คุณแล้ว" });
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
        toast({ variant: 'destructive', title: 'Could not fetch workers' });
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
    try {
        const vendorsQuery = query(
            collection(db, "outsourceVendors"),
            where("isActive", "==", true),
            orderBy("shopName", "asc")
        );
        const querySnapshot = await getDocs(vendorsQuery);
        setOutsourceVendors(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutsourceVendor)));
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Could not fetch outsource vendors', description: error.message });
        setOutsourceVendors([]);
    } finally {
        setIsFetchingVendors(false);
    }
  };
  
  const handleConfirmOutsource = async () => {
    if (!db || !profile || !outsourcingJob || !selectedVendorId) {
        toast({ variant: "destructive", title: "ข้อมูลไม่ครบถ้วน" });
        return;
    }
    
    const selectedVendor = outsourceVendors.find(v => v.id === selectedVendorId);
    if (!selectedVendor) {
        toast({ variant: "destructive", title: "ไม่พบร้าน Outsource" });
        return;
    }

    setIsAccepting(outsourcingJob.id); // Re-use this state for loading indicator
    try {
        const batch = writeBatch(db);
        const jobRef = doc(db, 'jobs', outsourcingJob.id);
        const activityRef = doc(collection(db, 'jobs', outsourcingJob.id, 'activities'));

        batch.update(jobRef, {
            status: 'IN_PROGRESS',
            assigneeUid: selectedVendor.id,
            assigneeName: selectedVendor.shopName,
            lastActivityAt: serverTimestamp(),
        });

        const activityText = `ส่งงานให้ร้านนอก: ${selectedVendor.shopName}. หมายเหตุ: ${outsourceNotes || 'ไม่มี'}`;
        batch.set(activityRef, {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();
        toast({ title: 'ส่งงานให้ร้านนอกสำเร็จ' });
        setOutsourcingJob(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'การส่งงานล้มเหลว', description: error.message });
    } finally {
        setIsAccepting(null);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!db || !profile || !assigningJob || !selectedWorkerId) return;
    
    const selectedWorker = workers.find(w => w.uid === selectedWorkerId);
    if (!selectedWorker) {
        toast({ variant: "destructive", title: "ไม่พบพนักงาน" });
        return;
    }

    setIsAccepting(assigningJob.id);
    try {
        const jobDocRef = doc(db, "jobs", assigningJob.id);

        await runTransaction(db, async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists()) {
                throw new Error("ไม่พบงานที่ต้องการมอบหมาย");
            }

            const jobData = jobDoc.data() as Job;

            if (jobData.status !== 'RECEIVED') {
                throw new Error("ไม่สามารถมอบหมายงานได้ เพราะสถานะเปลี่ยนไปแล้ว");
            }

            if (jobData.assigneeUid) {
                throw new Error("งานนี้ถูกผู้อื่นรับไปแล้ว");
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

        toast({ title: "มอบหมายงานสำเร็จ", description: `งานได้ถูกมอบหมายให้ ${selectedWorker.displayName}` });
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
                    หน้านี้จะพยายามโหลดข้อมูลใหม่โดยอัตโนมัติใน 10 วินาที หรือคุณสามารถลองรีเฟรชหน้านี้อีกครั้งในภายหลัง
                </CardDescription>
            </CardHeader>
            {indexCreationUrl && (
                <CardContent>
                    <Button asChild variant="outline">
                        <a href={indexCreationUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            ตรวจสอบสถานะ
                        </a>
                    </Button>
                </CardContent>
            )}
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
                    ฐานข้อมูลต้องการดัชนี (Index) เพื่อกรองและเรียงข้อมูลงานตามที่คุณต้องการ
                    กรุณากดปุ่มด้านล่างเพื่อเปิดหน้าสร้างใน Firebase Console (อาจใช้เวลา 2-3 นาที)
                    เมื่อสร้างเสร็จแล้ว ให้กลับมารีเฟรชหน้านี้อีกครั้ง
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
             <CardFooter className="flex-col items-center gap-2 pt-4">
                <p className="text-xs text-muted-foreground">Query details:</p>
                <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md max-w-full overflow-x-auto">
                    {department && `department: ${department}, `}
                    {status && `status: ${Array.isArray(status) ? `[${status.join(', ')}]` : status}, `}
                    {assigneeUid && `assigneeUid: ${assigneeUid}, `}
                    {`orderBy: ${orderByField} ${orderByDirection}`}
                </p>
            </CardFooter>
        </Card>
    );
  }
  
  if (error) {
       return (
        <Card className="text-center py-12">
            <CardHeader className="items-center">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <CardTitle>Error Loading Jobs</CardTitle>
                <CardDescription>{error.message}</CardDescription>
            </CardHeader>
        </Card>
       );
  }

  if (filteredJobs.length === 0) {
     return (
        <Card className="text-center py-12">
            <CardHeader>
                <CardTitle>{searchTerm ? 'No jobs match your search' : emptyTitle}</CardTitle>
                <CardDescription>{searchTerm ? 'Try a different search term.' : emptyDescription}</CardDescription>
            </CardHeader>
            {children && <CardContent>{children}</CardContent>}
        </Card>
     );
  }

  return (
    <>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredJobs.map(job => (
        <Card key={job.id} className="flex flex-col overflow-hidden">
          <div className="relative aspect-[16/10] w-full bg-muted">
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
              {job.assigneeName && <span className="font-medium"> • {job.assigneeName}</span>}
              <br />
              Last update: {safeFormat(job.lastActivityAt, 'PP')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
          </CardContent>
          <CardFooter className={cn(
            "mt-auto grid gap-2 p-4",
            (job.status === 'RECEIVED' && (profile?.department === job.department || isOfficeOrAdmin)) ? 'grid-cols-2' :
            (actionPreset === 'waitingApprove' || (actionPreset === 'pendingPartsReady' && job.status === 'PENDING_PARTS'))
              ? 'grid-cols-1'
              : (job.status === 'WAITING_QUOTATION' || job.status === 'WAITING_APPROVE' || job.status === 'DONE' || job.status === 'WAITING_CUSTOMER_PICKUP') ? "grid-cols-2" : "grid-cols-1"
          )}>
            {actionPreset === 'pendingPartsReady' && job.status === 'PENDING_PARTS' && isOfficeOrAdmin ? (
                <Button variant="default" className="w-full" onClick={() => setJobForPartsReady(job)}>
                    <PackageCheck className="mr-2 h-4 w-4" />
                    จัดอะไหล่เรียบร้อย
                </Button>
            ) : actionPreset === 'waitingApprove' ? (
              <Button asChild variant="default" className="w-full">
                <Link href={`/app/jobs/${job.id}`}>
                  <UserCheck />
                  แจ้งผลอนุมัติ
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/app/jobs/${job.id}`}>
                    ดูรายละเอียด
                  </Link>
                </Button>
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
                {job.status === 'DONE' && (
                   <Button
                    variant="default"
                    className="w-full"
                    onClick={() => setBillingJob(job)}
                  >
                    <Receipt />
                    ออกบิล
                  </Button>
                )}
                 {job.status === 'WAITING_CUSTOMER_PICKUP' && isOfficeOrAdmin && (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={() => handleOpenCloseDialog(job)}
                  >
                    <PackageCheck />
                    ส่งงาน
                  </Button>
                )}
              </>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
    <Dialog open={!!assigningJob} onOpenChange={(isOpen) => { if (!isOpen) setAssigningJob(null) }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>มอบหมายงาน</DialogTitle>
                <DialogDescription>
                    เลือกพนักงานเพื่อรับผิดชอบงานนี้
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
                <p className="py-4 text-muted-foreground">ไม่พบพนักงานในแผนกนี้</p>
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
                    กรุณาเลือกประเภทเอกสารที่ต้องการออกสำหรับงานนี้
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
                <DialogTitle>ส่งมอบงาน / ปิดงาน</DialogTitle>
                <DialogDescription>
                    สำหรับ: {closingJob?.customerSnapshot.name}
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div>
                    <Label htmlFor="pickupDate">วันที่ลูกค้ารับสินค้า</Label>
                    <Input id="pickupDate" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}/>
                </div>
                <div>
                    <Label htmlFor="salesDoc">เอกสารขายที่เกี่ยวข้อง</Label>
                    {isLoadingDocs ? <Loader2 className="animate-spin"/> : (
                        relatedDocs.length > 0 ? (
                            <Select onValueChange={setSelectedDocId} value={selectedDocId}>
                                <SelectTrigger id="salesDoc"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                {relatedDocs.map(doc => (
                                    <SelectItem key={doc.id} value={doc.id}>
                                        {doc.docType === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบส่งของชั่วคราว'} {doc.docNo}
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                        ) : <p className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">ไม่พบเอกสารขาย กรุณาออกบิลก่อน</p>
                    )}
                </div>
                <div>
                    <Label>สถานะการชำระ</Label>
                    <RadioGroup value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)} className="flex gap-4 pt-2">
                        <div className="flex items-center space-x-2"><RadioGroupItem value="PAID" id="paid" /><Label htmlFor="paid">จ่ายแล้ว</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="UNPAID" id="unpaid" /><Label htmlFor="unpaid">เครดิต (ยังไม่จ่าย)</Label></div>
                    </RadioGroup>
                </div>
                {paymentMode === 'PAID' && (
                    <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                        <h4 className="font-semibold text-sm">ข้อมูลการชำระเงิน</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>ช่องทางรับเงิน</Label>
                                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอน</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>บัญชีที่คาดว่าจะเข้า</Label>
                                {isLoadingAccounts ? <Loader2 className="animate-spin"/> : (
                                    <Select value={suggestedAccountId} onValueChange={setSuggestedAccountId}>
                                        <SelectTrigger><SelectValue placeholder="เลือกบัญชี..."/></SelectTrigger>
                                        <SelectContent>
                                            {accountingAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                         <div>
                            <Label htmlFor="paymentNotes">หมายเหตุ</Label>
                            <Textarea id="paymentNotes" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="รายละเอียดเพิ่มเติม..."/>
                         </div>
                    </div>
                )}
                 {paymentMode === 'UNPAID' && (
                    <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                        <Label htmlFor="creditDueDate">วันครบกำหนดชำระ (ถ้ามี)</Label>
                        <Input id="creditDueDate" type="date" value={creditDueDate} onChange={(e) => setCreditDueDate(e.target.value)}/>
                    </div>
                 )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setClosingJob(null)} disabled={isClosing}>ยกเลิก</Button>
                <Button onClick={handleCloseJob} disabled={isClosing || isLoadingDocs || !selectedDocId}>
                    {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันส่งงาน
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
                <DialogTitle>ส่งงานให้ร้านนอก</DialogTitle>
                <DialogDescription>
                    เลือกรายชื่อร้าน Outsource และกรอกหมายเหตุ
                </DialogDescription>
            </DialogHeader>
            {isFetchingVendors ? (
                <div className="flex justify-center items-center h-24">
                    <Loader2 className="animate-spin" />
                </div>
            ) : outsourceVendors.length > 0 ? (
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="outsource-vendor">เลือกร้าน Outsource</Label>
                        <Select onValueChange={setSelectedVendorId} value={selectedVendorId || ""}>
                            <SelectTrigger id="outsource-vendor">
                                <SelectValue placeholder="เลือกร้าน..." />
                            </SelectTrigger>
                            <SelectContent>
                                {outsourceVendors.map(vendor => (
                                    <SelectItem key={vendor.id} value={vendor.id}>
                                        {vendor.shopName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="outsource-notes">หมายเหตุ</Label>
                        <Textarea id="outsource-notes" value={outsourceNotes} onChange={e => setOutsourceNotes(e.target.value)} placeholder="รายละเอียดเพิ่มเติม เช่น วันนัดรับ..." />
                    </div>
                </div>
            ) : (
                <p className="py-4 text-muted-foreground">ไม่พบรายชื่อร้าน Outsource</p>
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setOutsourcingJob(null)}>ยกเลิก</Button>
                <Button onClick={handleConfirmOutsource} disabled={!selectedVendorId || isAccepting !== null}>
                    {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันการส่งต่อ
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
