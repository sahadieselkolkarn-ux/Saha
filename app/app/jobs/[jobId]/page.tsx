"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from 'next/link';
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, Timestamp, collection, query, orderBy, addDoc, writeBatch, where, getDocs, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase, useCollection, useDoc, type WithId } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { safeFormat } from '@/lib/date-utils';
import { archiveCollectionNameByYear } from '@/lib/archive-utils';
import { jobStatusLabel, deptLabel } from "@/lib/ui-labels";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JOB_DEPARTMENTS, type JobStatus } from "@/lib/constants";
import { Loader2, User, Clock, Paperclip, X, Send, Save, AlertCircle, Camera, FileText, CheckCircle, ArrowLeft, Ban, PackageCheck, Check, UserCheck, Edit, Phone, Receipt } from "lucide-react";
import type { Job, JobActivity, JobDepartment, Document as DocumentType, DocType, UserProfile } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { JobVehicleDetails } from "@/components/job-details/job-vehicle-details";

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

function JobDetailsPageContent() {
  const router = useRouter();
  const { jobId } = useParams();
  const searchParams = useSearchParams();
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundInPrimary, setNotFoundInPrimary] = useState(false);
  
  const [newNote, setNewNote] = useState("");
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferDepartment, setTransferDepartment] = useState<JobDepartment | ''>('');
  const [transferNote, setTransferNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [departmentWorkers, setDepartmentWorkers] = useState<UserProfile[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(false);
  const [reassignWorkerId, setReassignWorkerId] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  const [techReport, setTechReport] = useState("");
  const [isSavingTechReport, setIsSavingTechReport] = useState(false);
  const [isRequestingQuotation, setIsRequestingQuotation] = useState(false);

  const [isApprovalActionLoading, setIsApprovalActionLoading] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isPartsReadyConfirmOpen, setIsPartsReadyConfirmOpen] = useState(false);
  const [isRejectChoiceOpen, setIsRejectChoiceOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [rejectionChoice, setRejectionChoice] = useState<'with_cost' | 'no_cost' | null>(null);
  
  const [relatedDocuments, setRelatedDocuments] = useState<Partial<Record<DocType, DocumentType[]>>>({});
  const [loadingDocs, setLoadingDocs] = useState(true);

  const [isEditDescriptionDialogOpen, setIsEditDescriptionDialogOpen] = useState(false);
  const [descriptionToEdit, setDescriptionToEdit] = useState("");
  const [isUpdatingDescription, setIsUpdatingDescription] = useState(false);

  const [isEditOfficeNoteDialogOpen, setIsEditOfficeNoteDialogOpen] = useState(false);
  const [officeNoteToEdit, setOfficeNoteToEdit] = useState("");
  const [isUpdatingOfficeNote, setIsUpdatingOfficeNote] = useState(false);

  const [isEditVehicleDialogOpen, setIsEditVehicleDialogOpen] = useState(false);
  const [vehicleEditData, setVehicleEditData] = useState<any>({});
  const [isUpdatingVehicle, setIsUpdatingVehicle] = useState(false);

  const [billingJob, setBillingJob] = useState<Job | null>(null);
  
  const activitiesQuery = useMemo(() => {
    if (!db || !jobId) return null;
    if (job?.isArchived) {
      const year = new Date(job.closedDate!).getFullYear();
      return query(collection(db, archiveCollectionNameByYear(year), jobId as string, "activities"), orderBy("createdAt", "desc"));
    }
    return query(collection(db, "jobs", jobId as string, "activities"), orderBy("createdAt", "desc"));
  }, [db, jobId, job]);

  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useCollection<JobActivity>(activitiesQuery);

  const isUserAdmin = profile?.role === 'ADMIN';
  const isOfficeOrAdminOrMgmt = profile?.role === 'ADMIN' || profile?.department === 'OFFICE' || profile?.department === 'MANAGEMENT';
  const allowEditing = searchParams.get('edit') === 'true' && isUserAdmin;
  const isViewOnly = (job?.status === 'CLOSED' && !allowEditing) || job?.isArchived;
  const isOfficeOrAdmin = profile?.department === 'OFFICE' || profile?.role === 'ADMIN';

  useEffect(() => {
    if (!db || !jobId) return;

    setLoadingDocs(true);
    const docsQuery = query(collection(db, "documents"), where("jobId", "==", jobId as string));

    const unsubscribeDocs = onSnapshot(docsQuery, (snapshot) => {
        const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DocumentType));
        const grouped: Partial<Record<DocType, DocumentType[]>> = {};
        const relevantDocTypes: DocType[] = ['QUOTATION', 'DELIVERY_NOTE', 'TAX_INVOICE', 'RECEIPT'];

        for (const doc of allDocs) {
            if (relevantDocTypes.includes(doc.docType)) {
                if (!grouped[doc.docType]) {
                    grouped[doc.docType] = [];
                }
                grouped[doc.docType]!.push(doc);
            }
        }

        for (const docType in grouped) {
            grouped[docType as DocType]!.sort((a, b) => {
                const dateA = new Date(a.docDate).getTime();
                const dateB = new Date(b.docDate).getTime();
                if (dateB !== dateA) return dateB - dateA;
                return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
            });
        }
        
        setRelatedDocuments(grouped);
        setLoadingDocs(false);
    }, (error) => {
        console.error("Error fetching related documents:", error);
        toast({ variant: "destructive", title: "Could not load related documents." });
        setLoadingDocs(false);
    });

    return () => unsubscribeDocs();
  }, [db, jobId, toast]);


  useEffect(() => {
    if (!jobId || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    const unsubscribe = onSnapshot(jobDocRef, (doc) => {
      if (doc.exists()) {
        const jobData = { id: doc.id, ...doc.data() } as Job;
        setJob(jobData);
        setTechReport(jobData.technicalReport || "");
        setLoading(false);
        setNotFoundInPrimary(false);
      } else {
        setNotFoundInPrimary(true);
      }
    },
    (error) => {
      toast({ variant: "destructive", title: "Error", description: "Failed to load job details."});
      setLoading(false);
    });
    return () => unsubscribe();
  }, [jobId, toast, db]);

  useEffect(() => {
    if (!notFoundInPrimary || !db) return;

    setLoading(true);
    const searchArchives = async () => {
      const currentYear = new Date().getFullYear();
      for (let i = 0; i < 5; i++) { // Search last 5 years
        const year = currentYear - i;
        const archiveColName = archiveCollectionNameByYear(year);
        try {
          const archiveDocRef = doc(db, archiveColName, jobId as string);
          const docSnap = await getDoc(archiveDocRef);
          if (docSnap.exists()) {
            const jobData = { id: docSnap.id, ...docSnap.data() } as Job;
            setJob(jobData);
            setTechReport(jobData.technicalReport || "");
            setLoading(false);
            return;
          }
        } catch (e) {
          console.log(`Could not search archive ${archiveColName}`, e);
        }
      }
      setLoading(false); // Job is still null if not found
    };

    searchArchives();
  }, [notFoundInPrimary, db, jobId]);

  const handleOpenEditDescriptionDialog = () => {
    setDescriptionToEdit(job?.description || "");
    setIsEditDescriptionDialogOpen(true);
  }

  const handleUpdateDescription = async () => {
    if (!db || !job || !profile) return;
    
    setIsUpdatingDescription(true);
    
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", job.id);
      const activityDocRef = doc(collection(db, "jobs", job.id, "activities"));

      batch.update(jobDocRef, {
        description: descriptionToEdit,
        lastActivityAt: serverTimestamp(),
      });
      batch.set(activityDocRef, {
          text: `แก้ไขรายการแจ้งซ่อม`,
          userName: profile.displayName,
          userId: profile.uid,
          createdAt: serverTimestamp(),
      });
      
      await batch.commit();

      toast({ title: "อัปเดตรายการแจ้งซ่อมสำเร็จ" });
      setIsEditDescriptionDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsUpdatingDescription(false);
    }
  };

  const handleOpenEditOfficeNoteDialog = () => {
    setOfficeNoteToEdit(job?.officeNote || "");
    setIsEditOfficeNoteDialogOpen(true);
  }

  const handleUpdateOfficeNote = async () => {
    if (!db || !job || !profile) return;
    
    setIsUpdatingOfficeNote(true);
    
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", job.id);
      const activityDocRef = doc(collection(db, "jobs", job.id, "activities"));

      batch.update(jobDocRef, {
        officeNote: officeNoteToEdit,
        lastActivityAt: serverTimestamp(),
      });
      batch.set(activityDocRef, {
          text: `แก้ไขบันทึกข้อความ`,
          userName: profile.displayName,
          userId: profile.uid,
          createdAt: serverTimestamp(),
      });
      
      await batch.commit();

      toast({ title: "อัปเดตบันทึกข้อความสำเร็จ" });
      setIsEditOfficeNoteDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsUpdatingOfficeNote(false);
    }
  };

  const handleOpenEditVehicleDialog = () => {
    if (job?.department === 'CAR_SERVICE') {
        setVehicleEditData(job.carServiceDetails || {});
    } else if (job?.department === 'COMMONRAIL') {
        setVehicleEditData(job.commonrailDetails || {});
    } else if (job?.department === 'MECHANIC') {
        setVehicleEditData(job.mechanicDetails || {});
    }
    setIsEditVehicleDialogOpen(true);
  };

  const handleUpdateVehicleDetails = async () => {
    if (!db || !job || !profile) return;
    
    setIsUpdatingVehicle(true);
    
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", job.id);
      const activityDocRef = doc(collection(db, "jobs", job.id, "activities"));

      const fieldName = job.department === 'CAR_SERVICE' ? 'carServiceDetails' : 
                       job.department === 'COMMONRAIL' ? 'commonrailDetails' : 'mechanicDetails';

      batch.update(jobDocRef, {
        [fieldName]: vehicleEditData,
        lastActivityAt: serverTimestamp(),
      });
      batch.set(activityDocRef, {
          text: `แก้ไขรายละเอียดรถ/ชิ้นส่วน`,
          userName: profile.displayName,
          userId: profile.uid,
          createdAt: serverTimestamp(),
      });
      
      await batch.commit();

      toast({ title: "อัปเดตรายละเอียดสำเร็จ" });
      setIsEditVehicleDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsUpdatingVehicle(false);
    }
  };

  const handleMarkAsDone = async () => {
    if (!jobId || !db || !job || !profile) return;

    setIsSubmittingNote(true);
    try {
        const batch = writeBatch(db);
        const jobDocRef = doc(db, "jobs", jobId as string);
        const activityDocRef = doc(collection(db, "jobs", jobId as string, "activities"));
        
        batch.update(jobDocRef, {
            status: 'DONE',
            lastActivityAt: serverTimestamp()
        });

        batch.set(activityDocRef, {
            text: `เปลี่ยนสถานะเป็น "${jobStatusLabel('DONE')}"`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();
        toast({ title: "Job Marked as Done" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsSubmittingNote(false);
    }
  };

  const handleRequestQuotation = async () => {
    if (!jobId || !db || !job || !profile) return;

    setIsRequestingQuotation(true);
    try {
        const batch = writeBatch(db);
        const jobDocRef = doc(db, "jobs", jobId as string);
        const activityDocRef = doc(collection(db, "jobs", jobId as string, "activities"));
        
        batch.update(jobDocRef, {
            status: 'WAITING_QUOTATION',
            lastActivityAt: serverTimestamp()
        });

        batch.set(activityDocRef, {
            text: `แจ้งขอเสนอราคา`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();
        toast({ title: "Quotation Requested", description: "Job status has been updated to WAITING_QUOTATION." });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Request Failed", description: error.message });
    } finally {
        setIsRequestingQuotation(false);
    }
  };

  const handleSaveTechReport = async () => {
    if (!jobId || !db || !profile) return;
    setIsSavingTechReport(true);
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", jobId as string);
      const activityDocRef = doc(collection(db, "jobs", jobId as string, "activities"));

      batch.update(jobDocRef, {
        technicalReport: techReport,
        lastActivityAt: serverTimestamp()
      });

      batch.set(activityDocRef, {
          text: `อัปเดตผลการตรวจ/งานที่ทำ`,
          userName: profile.displayName,
          userId: profile.uid,
          createdAt: serverTimestamp(),
          photos: [],
      });
      
      await batch.commit();

      toast({ title: `Technical report updated` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsSavingTechReport(false);
    }
  };
  
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const totalPhotos = (job?.photos?.length || 0) + newPhotos.length + files.length;
      if (totalPhotos > 4) {
        toast({ variant: "destructive", title: "You can only have up to 4 photos in total." });
        return;
      }
       files.forEach(file => {
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
              toast({ variant: "destructive", title: `File ${file.name} is too large.`, description: "Max size is 5MB." });
              return;
          }
          setNewPhotos(prev => [...prev, file]);
          setPhotoPreviews(prev => [...prev, URL.createObjectURL(file)]);
      });
    }
  };

  const removeNewPhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setNewPhotos(p => p.filter((_, i) => i !== index));
    setPhotoPreviews(p => p.filter((_, i) => i !== index));
  };
  
  const handleAddActivity = async () => {
    if ((!newNote.trim() && newPhotos.length === 0) || !jobId || !db || !storage || !profile || !job) return;
    setIsSubmittingNote(true);
    
    try {
        const jobDocRef = doc(db, "jobs", jobId as string);
        const activitiesColRef = collection(db, "jobs", jobId as string, "activities");

        const photoURLs: string[] = [];
        for (const photo of newPhotos) {
            const photoRef = ref(storage, `jobs/${jobId}/activity/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }
        
        const batch = writeBatch(db);
        
        const jobUpdates: any = { 
            lastActivityAt: serverTimestamp() 
        };
        
        batch.set(doc(activitiesColRef), {
            text: newNote,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: photoURLs,
        });
        
        batch.update(jobDocRef, jobUpdates);
        
        await batch.commit();

        setNewNote("");
        setNewPhotos([]);
        photoPreviews.forEach(url => URL.revokeObjectURL(url));
        setPhotoPreviews([]);
        toast({title: "Activity added successfully"});
    } catch (error: any) {
        toast({variant: "destructive", title: "Failed to add activity", description: error.message});
    } finally {
        setIsSubmittingNote(false);
    }
  };

  const handleQuickPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !jobId || !db || !storage || !profile) return;
    setIsAddingPhotos(true);

    const files = Array.from(e.target.files);
    
    const totalPhotos = (job?.photos?.length || 0) + files.length;
    if (totalPhotos > 4) {
      toast({ variant: "destructive", title: "You can only have up to 4 photos in total." });
      setIsAddingPhotos(false);
      return;
    }
    
    const validFiles = files.filter(file => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({ variant: "destructive", title: `File ${file.name} is too large.`, description: "Max size is 5MB." });
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) {
        setIsAddingPhotos(false);
        return;
    }

    try {
        const jobDocRef = doc(db, "jobs", jobId as string);
        const activitiesColRef = collection(db, "jobs", jobId as string, "activities");

        const photoURLs: string[] = [];
        for (const photo of validFiles) {
            const photoRef = ref(storage, `jobs/${jobId}/photos/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }
        
        const batch = writeBatch(db);
        
        batch.set(doc(activitiesColRef), {
            text: `Added ${validFiles.length} photo(s) to the main job.`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: photoURLs,
        });
        
        batch.update(jobDocRef, { 
            photos: arrayUnion(...photoURLs),
            lastActivityAt: serverTimestamp() 
        });
        
        await batch.commit();
        toast({title: `${validFiles.length} photo(s) added successfully`});
    } catch(error: any) {
        toast({variant: "destructive", title: "Failed to add photos", description: error.message});
    } finally {
        setIsAddingPhotos(false);
        e.target.value = ''; // Reset file input
    }
  }

  const handleTransferJob = async () => {
    if (!isUserAdmin) {
        toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "เฉพาะแอดมินเท่านั้นที่สามารถโอนย้ายแผนกได้" });
        return;
    }
    if (!transferDepartment || !job || !db || !profile) return;
    
    setIsTransferring(true);
    try {
        const jobDocRef = doc(db, "jobs", job.id);
        const activitiesColRef = collection(db, "jobs", job.id, "activities");

        const batch = writeBatch(db);

        batch.update(jobDocRef, {
            department: transferDepartment,
            status: 'RECEIVED',
            assigneeUid: null,
            assigneeName: null,
            lastActivityAt: serverTimestamp(),
        });

        const activityText = `แอดมินเปลี่ยนแผนกหลักของงานเป็น ${transferDepartment} และคืนงานเข้าคิวแผนก. หมายเหตุ: ${transferNote || 'ไม่มี'}`;
        batch.set(doc(activitiesColRef), {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();

        toast({ title: 'โอนย้ายแผนกสำเร็จ', description: `งานถูกย้ายไปยังแผนก ${transferDepartment}`});
        setIsTransferDialogOpen(false);
    } catch(error: any) {
        toast({ variant: "destructive", title: "การโอนย้ายล้มเหลว", description: error.message });
    } finally {
        setIsTransferring(false);
    }
  };

  const handleOpenReassignDialog = async () => {
    if (!db || !job) return;
    setIsReassignDialogOpen(true);
    setReassignWorkerId(null);
    setIsFetchingWorkers(true);
    try {
      const q = query(
        collection(db, "users"),
        where("department", "==", job.department),
        where("role", "==", "WORKER"),
        where("status", "==", "ACTIVE")
      );
      const snapshot = await getDocs(q);
      const workers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      setDepartmentWorkers(workers.filter(w => w.uid !== job.assigneeUid));
    } catch (error) {
      toast({ variant: 'destructive', title: "Failed to fetch workers" });
      setDepartmentWorkers([]);
    } finally {
      setIsFetchingWorkers(false);
    }
  };

  const handleReassignJob = async () => {
    if (!db || !profile || !job || !reassignWorkerId) return;

    const newWorker = departmentWorkers.find(w => w.uid === reassignWorkerId);
    if (!newWorker) {
      toast({ variant: "destructive", title: "Selected worker not found." });
      return;
    }

    setIsReassigning(true);
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", job.id);
      const activityDocRef = doc(collection(db, "jobs", job.id, "activities"));

      batch.update(jobDocRef, {
        assigneeUid: newWorker.uid,
        assigneeName: newWorker.displayName,
        lastActivityAt: serverTimestamp(),
      });

      const activityText = `แอดมินเปลี่ยนพนักงานซ่อม จาก ${job.assigneeName || 'ยังไม่ได้มอบหมาย'} เป็น ${newWorker.displayName}`;
      batch.set(activityDocRef, {
        text: activityText,
        userName: profile.displayName,
        userId: profile.uid,
        createdAt: serverTimestamp(),
        photos: [],
      });
      
      await batch.commit();
      toast({ title: "มอบหมายงานใหม่สำเร็จ" });
      setIsReassignDialogOpen(false);

    } catch (error: any) {
      toast({ variant: 'destructive', title: "การมอบหมายงานล้มเหลว", description: error.message });
    } finally {
      setIsReassigning(false);
    }
  };

  const handleCustomerApproval = async () => {
    if (!jobId || !db || !profile) return;
    setIsApprovalActionLoading(true);
    const activityText = `ลูกค้าอนุมัติ → เปลี่ยนสถานะเป็น "${jobStatusLabel('PENDING_PARTS')}"`;
    
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, "jobs", jobId as string), { status: 'PENDING_PARTS', lastActivityAt: serverTimestamp() });
        batch.set(doc(collection(db, "jobs", jobId as string, "activities")), {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
        });
        await batch.commit();
        toast({ title: "Job Approved", description: "Status changed to PENDING_PARTS." });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsApprovalActionLoading(false);
        setIsApproveConfirmOpen(false);
    }
};

const handleCustomerRejection = async () => {
    if (!jobId || !db || !profile || !rejectionChoice || !job) return;
    setIsApprovalActionLoading(true);

    try {
        const batch = writeBatch(db);
        const jobDocRef = doc(db, "jobs", jobId as string);
        const activityDocRef = doc(collection(db, "jobs", jobId as string, "activities"));
        
        if (rejectionChoice === 'with_cost') {
            batch.update(jobDocRef, { status: 'DONE', lastActivityAt: serverTimestamp() });
            batch.set(activityDocRef, {
                text: `ลูกค้าไม่อนุมัติ (มีค่าใช้จ่าย) → ส่งไปทำบิล. แจ้งเตือนถึงแผนก ${job.department}: ลูกค้าไม่ประสงค์ที่จะซ่อม ให้เตรียมส่งสินค้าคืน`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
            });
            await batch.commit();
            toast({ title: "Job Rejected (with cost)", description: "Status changed to DONE." });
        } else { // no_cost
            batch.update(jobDocRef, { status: 'CLOSED', lastActivityAt: serverTimestamp() });
            batch.set(activityDocRef, {
                text: `ลูกค้าไม่อนุมัติ (ไม่มีค่าใช้จ่าย) → ปิดงาน. แจ้งเตือนถึงแผนก ${job.department}: ลูกค้าไม่ประสงค์ที่จะซ่อม ให้เตรียมส่งสินค้าคืน`,
                userName: profile.displayName,
                userId: profile.uid,
                createdAt: serverTimestamp(),
            });
            await batch.commit();
            toast({ title: "Job Rejected (no cost)", description: "Status changed to CLOSED." });
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsApprovalActionLoading(false);
        setIsRejectConfirmOpen(false);
        setRejectionChoice(null);
    }
};

const handlePartsReady = async () => {
    if (!jobId || !db || !profile || !job) return;
    setIsApprovalActionLoading(true);
    const activityText = `เตรียมอะไหล่เรียบร้อย → เปลี่ยนสถานะเป็น "${jobStatusLabel('IN_REPAIR_PROCESS')}". แจ้งเตือนถึงแผนก ${job.department}: จัดเตรียมอะไหล่เรียบร้อยแล้ว ให้ดำเนินการเบิกอะไหล่ และจัดการซ่อมได้`;
    
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, "jobs", jobId as string), { status: 'IN_REPAIR_PROCESS', lastActivityAt: serverTimestamp() });
        batch.set(doc(collection(db, "jobs", jobId as string, "activities")), {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
        });
        await batch.commit();
        toast({ title: "Parts Ready", description: "Status changed to IN_REPAIR_PROCESS." });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsApprovalActionLoading(false);
        setIsPartsReadyConfirmOpen(false);
    }
};

  useEffect(() => {
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

  useEffect(() => {
      if (!isTransferDialogOpen) {
          setTransferNote('');
          setTransferDepartment('');
      }
  }, [isTransferDialogOpen])

  const DOC_STATUS_DISPLAY: Record<string, string> = {
    DRAFT: 'ฉบับร่าง',
    PAID: 'จ่ายแล้ว',
    CANCELLED: 'ยกเลิก',
    WAITING_CUSTOMER_PICKUP: 'รอลูกค้ารับ',
  };

  const DOC_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    DRAFT: 'secondary',
    PAID: 'default',
    CANCELLED: 'destructive',
    WAITING_CUSTOMER_PICKUP: 'outline',
  };


  if (loading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!job) {
    return <PageHeader title="ไม่พบงาน" />;
  }
  
  const statusKey = job?.status;
  const statusText = (statusKey && jobStatusLabel(statusKey)) ? jobStatusLabel(statusKey) : (statusKey ?? "-");

  return (
    <>
      <Button variant="outline" size="sm" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        ย้อนกลับ
      </Button>
      <PageHeader title={`Job: ${job.customerSnapshot.name}`} description={isViewOnly ? `VIEW-ONLY | ID: ${job.id.substring(0,8)}...` : `ID: ${job.id.substring(0,8)}...`} />
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>รายละเอียดใบงาน</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-base">ลูกค้า</h4>
                <p>
                  {job.customerSnapshot.name} (
                  <a 
                    href={`tel:${job.customerSnapshot.phone}`} 
                    className="text-primary hover:underline underline-offset-4 font-medium inline-flex items-center gap-1"
                  >
                    <Phone className="h-3 w-3" />
                    {job.customerSnapshot.phone}
                  </a>
                  )
                </p>
              </div>
              <div><h4 className="font-semibold text-base">แผนก</h4><p>{job.department}</p></div>
              {job.assigneeName && (
                  <div><h4 className="font-semibold text-base">ผู้รับผิดชอบ</h4><p>{job.assigneeName}</p></div>
              )}
               {job.status === 'CLOSED' && job.salesDocNo && (
                <div><h4 className="font-semibold text-base">เอกสารขายที่ใช้ปิดงาน</h4><p>{job.salesDocType}: {job.salesDocNo}</p></div>
              )}
              <div>
                <div className="flex items-center gap-4">
                    <h4 className="font-semibold text-base">รายการแจ้งซ่อม</h4>
                    {isOfficeOrAdminOrMgmt && (
                        <Button onClick={handleOpenEditDescriptionDialog} variant="outline" size="sm" className="h-7" disabled={isViewOnly}>
                            <Edit className="h-3 w-3 mr-1"/> แก้ไข
                        </Button>
                    )}
                </div>
                <p className="whitespace-pre-wrap pt-1">{job.description}</p>
              </div>
              
              {job && (
                <div className="border-t pt-4">
                    <div className="flex items-center gap-4 mb-2">
                        <h4 className="font-semibold text-base">รายละเอียดรถ/ชิ้นส่วน</h4>
                        {isOfficeOrAdminOrMgmt && (
                            <Button onClick={handleOpenEditVehicleDialog} variant="outline" size="sm" className="h-7" disabled={isViewOnly}>
                                <Edit className="h-3 w-3 mr-1"/> แก้ไข
                            </Button>
                        )}
                    </div>
                    <JobVehicleDetails job={job} />
                </div>
              )}

               <div className="flex gap-2 pt-4 border-t">
                  {isUserAdmin && (
                      <Button onClick={() => setIsTransferDialogOpen(true)} variant="outline" size="sm" disabled={isViewOnly}>
                          เปลี่ยนแปลงแผนก
                      </Button>
                  )}
                  {isUserAdmin && job.assigneeUid && (
                      <Button onClick={handleOpenReassignDialog} variant="outline" size="sm" disabled={isViewOnly}>
                          <UserCheck className="mr-2 h-4 w-4" /> เปลี่ยนพนักงานซ่อม
                      </Button>
                  )}
              </div>
            </CardContent>
          </Card>
          
          {(job.department === 'COMMONRAIL' || job.department === 'MECHANIC') && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {job.department === 'COMMONRAIL' ? 'ผลตรวจ / ค่าที่วัด' : 'ผลตรวจ / งานที่ทำ'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  placeholder="บันทึกรายละเอียดทางเทคนิค..."
                  value={techReport}
                  onChange={(e) => setTechReport(e.target.value)}
                  rows={6}
                  disabled={isViewOnly}
                />
                <Button onClick={handleSaveTechReport} disabled={isSavingTechReport || isViewOnly}>
                  {isSavingTechReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Report
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>รูปประกอบงาน (ตอนรับงาน)</CardTitle>
                {isOfficeOrAdminOrMgmt && (
                    <Button asChild variant="outline" size="sm" disabled={isAddingPhotos || isSubmittingNote || (job?.photos?.length || 0) >= 4 || isViewOnly}>
                        <label htmlFor="quick-photo-upload" className="cursor-pointer flex items-center">
                            {isAddingPhotos ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                            Add Photo
                            <Input 
                                id="quick-photo-upload" 
                                type="file" 
                                className="hidden" 
                                multiple 
                                accept="image/*" 
                                capture="environment" 
                                onChange={handleQuickPhotoUpload}
                                disabled={isAddingPhotos || isSubmittingNote || (job?.photos?.length || 0) >= 4 || isViewOnly}
                            />
                        </label>
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {job.photos && job.photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {job.photos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <Image src={url} alt={`Job photo ${i+1}`} width={200} height={200} className="rounded-md object-cover w-full aspect-square hover:opacity-80 transition-opacity" />
                            </a>
                        ))}
                    </div>
                ) : <p className="text-muted-foreground text-sm">ยังไม่มีรูปตอนรับงาน</p>}
                {!isOfficeOrAdminOrMgmt && !isViewOnly && (
                    <p className="text-xs text-muted-foreground mt-4">
                        ช่างเพิ่มรูปได้ที่ ‘กิจกรรมงาน (Activity)’ เท่านั้น
                    </p>
                )}
            </CardContent>
          </Card>

          {isOfficeOrAdminOrMgmt && (
            <Card>
              <CardHeader className="flex items-center gap-4">
                  <CardTitle>บันทึกข้อความ</CardTitle>
                   <Button onClick={handleOpenEditOfficeNoteDialog} variant="outline" size="sm" className="h-7" disabled={isViewOnly}>
                        <Edit className="h-3 w-3 mr-1"/> แก้ไข
                    </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm">{job.officeNote || 'ยังไม่มีบันทึก'}</p>
              </CardContent>
            </Card>
          )}
          
          <Card>
              <CardHeader><CardTitle>อัปเดทการทำงาน/รูปงาน</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="พิมพ์บันทึกที่นี่..." value={newNote} onChange={e => setNewNote(e.target.value)} disabled={isViewOnly} />
                {(photoPreviews.length > 0) && (
                  <div className="grid grid-cols-4 gap-2">
                    {photoPreviews.map((src, i) => (
                      <div key={i} className="relative">
                        <Image src={src} alt="preview" width={100} height={100} className="rounded-md object-cover w-full aspect-square" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5" onClick={() => removeNewPhoto(i)} disabled={isViewOnly}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                 <div className="flex flex-wrap gap-2">
                    <Button onClick={handleAddActivity} disabled={isSubmittingNote || isAddingPhotos || (!newNote.trim() && newPhotos.length === 0) || isViewOnly}>
                      {isSubmittingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                      อัปเดท
                    </Button>
                    <Button asChild variant="outline" disabled={isViewOnly || isSubmittingNote || isAddingPhotos}>
                        <label className="cursor-pointer flex items-center">
                            <Camera className="mr-2 h-4 w-4" />
                            เพิ่มรูปกิจกรรม
                            <Input
                                id="activity-photo-upload"
                                type="file"
                                className="hidden"
                                multiple
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoChange}
                                disabled={isViewOnly || isSubmittingNote || isAddingPhotos}
                            />
                        </label>
                    </Button>
                    {job.status === 'IN_PROGRESS' && (
                        <Button onClick={handleRequestQuotation} disabled={isRequestingQuotation || isSubmittingNote || isViewOnly} variant="outline">
                            {isRequestingQuotation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4"/>}
                            แจ้งเสนอราคา
                        </Button>
                    )}
                    {['IN_PROGRESS', 'WAITING_QUOTATION', 'WAITING_APPROVE', 'IN_REPAIR_PROCESS'].includes(job.status) && (
                        <Button onClick={handleMarkAsDone} disabled={isSubmittingNote || isViewOnly} variant="outline">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            จบงาน
                        </Button>
                    )}
                    {['DONE', 'WAITING_CUSTOMER_PICKUP'].includes(job.status) && isOfficeOrAdmin && (
                        <Button onClick={() => setBillingJob(job)} disabled={isSubmittingNote || isViewOnly} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                            <Receipt className="mr-2 h-4 w-4" />
                            ออกบิล
                        </Button>
                    )}
                </div>
              </CardContent>
            </Card>

          <Card>
            <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {activitiesLoading ? (
                  <div className="flex items-center justify-center h-24">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
              ) : activitiesError ? (
                  <div className="flex flex-col items-center justify-center h-24 text-destructive">
                      <AlertCircle className="h-6 w-6 mb-2" />
                      <p>Error loading activities.</p>
                      <p className="text-xs">{activitiesError.message}</p>
                  </div>
              ) : activities && activities.length > 0 ? (
                activities.map((activity) => (
                  <div key={activity.id} className="flex gap-4">
                      <User className="h-5 w-5 mt-1 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                          <p className="font-semibold">{activity.userName} <span className="text-xs font-normal text-muted-foreground ml-2">{safeFormat(activity.createdAt, 'PPpp')}</span></p>
                          {activity.text && <p className="whitespace-pre-wrap text-sm my-1">{activity.text}</p>}
                          {activity.photos && activity.photos.length > 0 && (
                               <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                                {activity.photos.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                        <Image src={url} alt={`Activity photo ${i+1}`} width={100} height={100} className="rounded-md font-medium object-cover w-full aspect-square" />
                                    </a>
                                ))}
                            </div>
                          )}
                      </div>
                  </div>
              ))
              ) : (
                <p className="text-muted-foreground text-sm text-center h-24 flex items-center justify-center">No activities yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">Status</CardTitle>
              <Badge variant={getStatusVariant(job.status)}>{statusText}</Badge>
            </CardHeader>
          </Card>
          <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Timestamps</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between"><span>Created:</span> <span>{safeFormat(job.createdAt, 'PPp')}</span></p>
                  <p className="flex justify-between"><span>Last Activity:</span> <span>{safeFormat(job.lastActivityAt, 'PPp')}</span></p>
              </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><FileText /> เอกสารอ้างอิง</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {loadingDocs ? <div className="flex justify-center"><Loader2 className="animate-spin"/></div> :
                (<>
                  {(['QUOTATION', 'DELIVERY_NOTE', 'TAX_INVOICE', 'RECEIPT'] as DocType[]).map(docTypeKey => {
                    const docType = docTypeKey;
                    const label = {
                      QUOTATION: 'ใบเสนอราคา',
                      DELIVERY_NOTE: 'ใบส่งของชั่วคราว',
                      TAX_INVOICE: 'ใบกำกับภาษี',
                      RECEIPT: 'ใบเสร็จ'
                    }[docType];

                    const latestDoc = relatedDocuments[docType]?.[0];
                    
                    return (
                      <div key={docType} className="flex justify-between items-start border-b border-muted/50 pb-2 last:border-0 last:pb-0">
                        <span className="text-muted-foreground pt-1">{label}:</span>
                        {latestDoc ? (
                           <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <Button asChild variant="link" className="p-0 h-auto font-medium">
                                    <Link href={`/app/office/documents/${latestDoc.id}`}>{latestDoc.docNo}</Link>
                                </Button>
                                <Badge variant={DOC_STATUS_VARIANT[latestDoc.status] || 'secondary'} className="text-[10px] px-1.5 h-5">
                                    {DOC_STATUS_DISPLAY[latestDoc.status] || latestDoc.status}
                                </Badge>
                              </div>
                              {latestDoc.status === 'CANCELLED' && (
                                <p className="text-[10px] text-muted-foreground italic">ยกเลิกเมื่อ {safeFormat(latestDoc.updatedAt, 'dd/MM/yy')}</p>
                              )}
                           </div>
                        ) : (
                          <span className="pt-1">— ไม่มี —</span>
                        )}
                      </div>
                    );
                  })}
                </>)
              }
            </CardContent>
          </Card>
          
          {isOfficeOrAdmin && ['WAITING_APPROVE', 'PENDING_PARTS'].includes(job.status) && (
            <Card>
              <CardHeader><CardTitle className="text-base font-semibold">การอนุมัติของลูกค้า</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {job.status === 'WAITING_APPROVE' && (
                  <>
                    <Button onClick={() => setIsApproveConfirmOpen(true)} className="w-full" variant="outline" disabled={isViewOnly || isApprovalActionLoading}>
                        <Check className="mr-2 h-4 w-4 text-green-600"/> ลูกค้าอนุมัติ
                    </Button>
                    <Button onClick={() => setIsRejectChoiceOpen(true)} className="w-full" variant="destructive" disabled={isViewOnly || isApprovalActionLoading}>
                        <Ban className="mr-2 h-4 w-4"/> ลูกค้าไม่อนุมัติ
                    </Button>
                  </>
                )}
                {job.status === 'PENDING_PARTS' && (
                  <Button onClick={() => setIsPartsReadyConfirmOpen(true)} className="w-full" variant="outline" disabled={isViewOnly || isApprovalActionLoading}>
                    <PackageCheck className="mr-2 h-4 w-4"/> เตรียมอะไหล่เรียบร้อย
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      
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

      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
          <DialogContent 
              onInteractOutside={(e) => {if (isTransferring) e.preventDefault()}}
              onEscapeKeyDown={(e) => {if (isTransferring) e.preventDefault()}}
          >
              <DialogHeader>
                  <DialogTitle>โอนย้ายแผนก</DialogTitle>
                  <DialogDescription>
                      เลือกแผนกปลายทางและเพิ่มหมายเหตุ (ถ้ามี) สถานะของงานจะถูกเปลี่ยนเป็น 'งานใหม่รอรับ' และผู้รับงานจะถูกล้าง
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                      <Label htmlFor="department">แผนกใหม่</Label>
                      <Select value={transferDepartment} onValueChange={(v) => setTransferDepartment(v as JobDepartment)}>
                          <SelectTrigger>
                              <SelectValue placeholder="เลือกแผนก" />
                          </SelectTrigger>
                          <SelectContent>
                              {JOB_DEPARTMENTS.filter(d => d !== job?.department).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="grid gap-2">
                      <Label htmlFor="note">หมายเหตุ (ถ้ามี)</Label>
                      <Textarea id="note" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="เพิ่มหมายเหตุการโอนย้าย..." />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)} disabled={isTransferring}>ยกเลิก</Button>
                  <Button onClick={handleTransferJob} disabled={isTransferring || !transferDepartment}>
                      {isTransferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      ยืนยันการโอนย้าย
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isEditDescriptionDialogOpen} onOpenChange={setIsEditDescriptionDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>แก้ไขรายการแจ้งซ่อม</DialogTitle>
                <DialogDescription>
                    แก้ไขรายละเอียดของรายการแจ้งซ่อมสำหรับงานนี้
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Textarea 
                    value={descriptionToEdit} 
                    onChange={(e) => setDescriptionToEdit(e.target.value)}
                    rows={8}
                    placeholder="ใส่รายละเอียดการแจ้งซ่อม..."
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDescriptionDialogOpen(false)} disabled={isUpdatingDescription}>ยกเลิก</Button>
                <Button onClick={handleUpdateDescription} disabled={isUpdatingDescription}>
                    {isUpdatingDescription && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    บันทึก
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={isEditOfficeNoteDialogOpen} onOpenChange={setIsEditOfficeNoteDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>แก้ไขบันทึกข้อความ</DialogTitle>
                <DialogDescription>
                    แก้ไขรายละเอียดของบันทึกข้อความสำหรับงานนี้
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Textarea 
                    value={officeNoteToEdit} 
                    onChange={(e) => setOfficeNoteToEdit(e.target.value)}
                    rows={8}
                    placeholder="ใส่บันทึกข้อความ..."
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOfficeNoteDialogOpen(false)} disabled={isUpdatingOfficeNote}>ยกเลิก</Button>
                <Button onClick={handleUpdateOfficeNote} disabled={isUpdatingOfficeNote}>
                    {isUpdatingOfficeNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    บันทึก
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={isEditVehicleDialogOpen} onOpenChange={setIsEditVehicleDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>แก้ไขรายละเอียดรถ/ชิ้นส่วน</DialogTitle>
                <DialogDescription>
                    แก้ไขข้อมูลทางเทคนิคของรถหรือชิ้นส่วนที่นำมาซ่อม
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {job.department === 'CAR_SERVICE' ? (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="brand">ยี่ห้อรถ</Label>
                            <Input id="brand" value={vehicleEditData.brand || ""} onChange={e => setVehicleEditData({...vehicleEditData, brand: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="model">รุ่นรถ</Label>
                            <Input id="model" value={vehicleEditData.model || ""} onChange={e => setVehicleEditData({...vehicleEditData, model: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="licensePlate">ทะเบียนรถ</Label>
                            <Input id="licensePlate" value={vehicleEditData.licensePlate || ""} onChange={e => setVehicleEditData({...vehicleEditData, licensePlate: e.target.value})} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="brand">ยี่ห้อ</Label>
                            <Input id="brand" value={vehicleEditData.brand || ""} onChange={e => setVehicleEditData({...vehicleEditData, brand: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="partNumber">เลขอะไหล่ (Part Number)</Label>
                            <Input id="partNumber" value={vehicleEditData.partNumber || ""} onChange={e => setVehicleEditData({...vehicleEditData, partNumber: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="registrationNumber">เลขทะเบียนชิ้นส่วน</Label>
                            <Input id="registrationNumber" value={vehicleEditData.registrationNumber || ""} onChange={e => setVehicleEditData({...vehicleEditData, registrationNumber: e.target.value})} />
                        </div>
                    </>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditVehicleDialogOpen(false)} disabled={isUpdatingVehicle}>ยกเลิก</Button>
                <Button onClick={handleUpdateVehicleDetails} disabled={isUpdatingVehicle}>
                    {isUpdatingVehicle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    บันทึก
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

      <Dialog open={isReassignDialogOpen} onOpenChange={setIsReassignDialogOpen}>
        <DialogContent
            onInteractOutside={(e) => {if (isReassigning) e.preventDefault()}}
            onEscapeKeyDown={(e) => {if (isReassigning) e.preventDefault()}}
        >
            <DialogHeader>
                <DialogTitle>เปลี่ยนพนักงานซ่อม</DialogTitle>
                <DialogDescription>
                    เลือกพนักงานใหม่สำหรับงานนี้ งานจะยังคงอยู่ในแผนก {job.department}
                </DialogDescription>
            </DialogHeader>
            {isFetchingWorkers ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
                <div className="py-4">
                    <Label htmlFor="worker-select">พนักงานใหม่</Label>
                    <Select value={reassignWorkerId || ""} onValueChange={reassignWorkerId => setReassignWorkerId(reassignWorkerId)}>
                        <SelectTrigger id="worker-select">
                            <SelectValue placeholder="เลือกพนักงาน..." />
                        </SelectTrigger>
                        <SelectContent>
                            {departmentWorkers.length > 0 ? (
                                departmentWorkers.map(w => <SelectItem key={w.uid} value={w.uid}>{w.displayName}</SelectItem>)
                            ) : (
                                <div className="p-4 text-sm text-muted-foreground text-center">ไม่พบช่างคนอื่นในแผนกนี้</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsReassignDialogOpen(false)} disabled={isReassigning}>ยกเลิก</Button>
                <Button onClick={handleReassignJob} disabled={isReassigning || isFetchingWorkers || !reassignWorkerId}>
                    {isReassigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ยืนยันการเปลี่ยน
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

      <AlertDialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการอนุมัติ</AlertDialogTitle>
                  <AlertDialogDescription>
                      ลูกค้าอนุมัติซ่อม ยืนยันเพื่อเปลี่ยนสถานะเป็น "กำลังจัดอะไหล่"?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isApprovalActionLoading}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCustomerApproval} disabled={isApprovalActionLoading}>
                      {isApprovalActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectChoiceOpen} onOpenChange={setIsRejectChoiceOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ลูกค้าไม่อนุมัติ</AlertDialogTitle>
                  <AlertDialogDescription>
                      การปฏิเสธการซ่อมครั้งนี้ มีค่าใช้จ่ายในการตรวจเช็คหรือไม่?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="destructive" onClick={() => { setIsRejectChoiceOpen(false); setRejectionChoice('with_cost'); setIsRejectConfirmOpen(true); }}>
                    มีค่าใช้จ่าย
                  </Button>
                  <Button variant="secondary" onClick={() => { setIsRejectChoiceOpen(false); setRejectionChoice('no_cost'); setIsRejectConfirmOpen(true); }}>
                    ไม่มีค่าใช้จ่าย
                  </Button>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการไม่อนุมัติ</AlertDialogTitle>
                  <AlertDialogDescription>
                      {rejectionChoice === 'with_cost' 
                        ? 'ลูกค้าไม่อนุมัติ (มีค่าใช้จ่าย) → ส่งไปทำบิล.'
                        : 'ลูกค้าไม่อนุมัติ (ไม่มีค่าใช้จ่าย) → ปิดงาน.'
                      }
                      <br/>
                      แจ้งเตือนถึงแผนก {job?.department}: ลูกค้าไม่ประสงค์ที่จะซ่อม ให้เตรียมส่งสินค้าคืน
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isApprovalActionLoading} onClick={() => setRejectionChoice(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCustomerRejection} disabled={isApprovalActionLoading}>
                      {isApprovalActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm"}
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isPartsReadyConfirmOpen} onOpenChange={setIsPartsReadyConfirmOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>ยืนยันการเตรียมอะไหล่</AlertDialogTitle>
                  <AlertDialogDescription>
                      จัดเตรียมอะไหล่เรียบร้อยแล้ว ให้ดำเนินการเบิกอะไหล่ และจัดการซ่อมได้
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isApprovalActionLoading}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePartsReady} disabled={isApprovalActionLoading}>
                      {isApprovalActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm"}
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function JobDetailsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>}>
      <JobDetailsPageContent />
    </Suspense>
  )
}
