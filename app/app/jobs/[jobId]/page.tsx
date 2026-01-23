

"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, Timestamp, collection, query, orderBy, addDoc, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useToast } from "@/hooks/use-toast";
import { safeFormat } from '@/lib/date-utils';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JOB_DEPARTMENTS, JOB_STATUS_DISPLAY, type JobStatus } from "@/lib/constants";
import { Loader2, User, Clock, Paperclip, X, Send, Save, AlertCircle, Camera } from "lucide-react";
import type { Job, JobActivity, JobDepartment } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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

export default function JobDetailsPage() {
  const { jobId } = useParams();
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [newNote, setNewNote] = useState("");
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferDepartment, setTransferDepartment] = useState<JobDepartment | ''>('');
  const [transferNote, setTransferNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const [techReport, setTechReport] = useState("");
  const [isSavingTechReport, setIsSavingTechReport] = useState(false);
  
  const activitiesQuery = useMemo(() => {
    if (!db || !jobId) return null;
    return query(collection(db, "jobs", jobId as string, "activities"), orderBy("createdAt", "desc"));
  }, [db, jobId]);

  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useCollection<JobActivity>(activitiesQuery);

  const canAddPhotos = profile?.department === 'OFFICE' || profile?.role === 'ADMIN';

  useEffect(() => {
    if (!jobId || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    const unsubscribe = onSnapshot(jobDocRef, (doc) => {
      if (doc.exists()) {
        const jobData = { id: doc.id, ...doc.data() } as Job;
        setJob(jobData);
        setTechReport(jobData.technicalReport || "");
      } else {
        setJob(null);
        toast({ variant: "destructive", title: "Job not found" });
      }
      setLoading(false);
    },
    (error) => {
      toast({ variant: "destructive", title: "Error", description: "Failed to load job details."});
      setLoading(false);
    });
    return () => unsubscribe();
  }, [jobId, toast, db]);

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
            text: `เปลี่ยนสถานะเป็น "${JOB_STATUS_DISPLAY['DONE']}"`,
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

  const handleSaveTechReport = async () => {
    if (!jobId || !db || !profile) return;
    setIsSavingTechReport(true);
    try {
      const batch = writeBatch(db);
      const jobDocRef = doc(db, "jobs", jobId as string);
      const activityDocRef = doc(collection(db, "jobs", jobId as string, "activities"));

      // 1. Update job report
      batch.update(jobDocRef, {
        technicalReport: techReport,
        lastActivityAt: serverTimestamp()
      });

      // 2. Add activity log
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
        
        // --- Status change logic ---
        const jobUpdates: any = { 
            photos: arrayUnion(...photoURLs),
            lastActivityAt: serverTimestamp() 
        };
        let activityText = newNote;
        
        if (job.status === 'IN_PROGRESS' && profile.department !== 'OFFICE') {
            jobUpdates.status = 'WAITING_QUOTATION';
            activityText = `อัปเดตงาน, สถานะเปลี่ยนเป็น "${JOB_STATUS_DISPLAY['WAITING_QUOTATION']}"\n\n${newNote}`;
        }
        
        // 1. Add new activity document
        batch.set(doc(activitiesColRef), {
            text: activityText,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: photoURLs,
        });
        
        // 2. Update main job document
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
            const photoRef = ref(storage, `jobs/${jobId}/activity/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }
        
        const batch = writeBatch(db);
        
        // 1. Add activity log
        batch.set(doc(activitiesColRef), {
            text: `Added ${validFiles.length} photo(s).`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: photoURLs,
        });
        
        // 2. Update main job document
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
    if (!transferDepartment || !job || !db || !profile) return;
    setIsTransferring(true);
    try {
        const jobDocRef = doc(db, "jobs", job.id);
        const activitiesColRef = collection(db, "jobs", job.id, "activities");

        const batch = writeBatch(db);

        // Update job doc
        batch.update(jobDocRef, {
            department: transferDepartment,
            status: 'RECEIVED', // Reset status to RECEIVED for the new department
            lastActivityAt: serverTimestamp(),
        });

        // Add activity to subcollection
        batch.set(doc(activitiesColRef), {
            text: `Transferred from ${job.department} to ${transferDepartment}. Note: ${transferNote || 'N/A'}`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();

        toast({ title: 'Job Transferred', description: `Job moved to ${transferDepartment} department.`});
        setIsTransferDialogOpen(false);
    } catch(error: any) {
        toast({ variant: "destructive", title: "Transfer Failed", description: error.message });
    } finally {
        setIsTransferring(false);
    }
  };

  useEffect(() => {
    // Cleanup function to revoke object URLs
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

  // Reset transfer form when dialog closes
  useEffect(() => {
      if (!isTransferDialogOpen) {
          setTransferNote('');
          setTransferDepartment('');
      }
  }, [isTransferDialogOpen])

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!job) {
    return <PageHeader title="Job Not Found" />;
  }
  
  return (
    <>
      <PageHeader title={`Job: ${job.customerSnapshot.name}`} description={`ID: ${job.id.substring(0,8)}...`} />
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div><h4 className="font-semibold text-base">Customer</h4><p>{job.customerSnapshot.name} ({job.customerSnapshot.phone})</p></div>
              <div><h4 className="font-semibold text-base">Department</h4><p>{job.department}</p></div>
              {job.assigneeName && (
                  <div><h4 className="font-semibold text-base">Assigned To</h4><p>{job.assigneeName}</p></div>
              )}
              <div><h4 className="font-semibold text-base">Description</h4><p className="whitespace-pre-wrap">{job.description}</p></div>
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
                />
                <Button onClick={handleSaveTechReport} disabled={isSavingTechReport}>
                  {isSavingTechReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Report
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Photos ({job.photos?.length ?? 0}/4)</CardTitle>
                {canAddPhotos && (
                    <Button asChild variant="outline" size="sm" disabled={isAddingPhotos || isSubmittingNote || (job?.photos?.length || 0) >= 4}>
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
                                disabled={isAddingPhotos || isSubmittingNote || (job?.photos?.length || 0) >= 4}
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
                ) : <p className="text-muted-foreground text-sm">No photos uploaded yet.</p>}
            </CardContent>
          </Card>
          
          <Card>
              <CardHeader><CardTitle>Add Activity / Photos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Type your note here..." value={newNote} onChange={e => setNewNote(e.target.value)} />
                <div className="flex items-center justify-center w-full">
                    <label htmlFor="activity-dropzone-file" className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg ${((job?.photos?.length || 0) + newPhotos.length) >= 4 ? "bg-muted/50 cursor-not-allowed" : "cursor-pointer bg-muted hover:bg-secondary"}`}>
                        <div className="flex flex-col items-center justify-center">
                        <Camera className="w-8 h-8 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Add Photos (up to 4 total)</p>
                        </div>
                        <Input id="activity-dropzone-file" type="file" className="hidden" multiple accept="image/*" capture="environment" onChange={handlePhotoChange} disabled={((job?.photos?.length || 0) + newPhotos.length) >= 4} />
                    </label>
                </div>
                {(photoPreviews.length > 0) && (
                  <div className="grid grid-cols-4 gap-2">
                    {photoPreviews.map((src, i) => (
                      <div key={i} className="relative">
                        <Image src={src} alt="preview" width={100} height={100} className="rounded-md object-cover w-full aspect-square" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5" onClick={() => removeNewPhoto(i)}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={handleAddActivity} disabled={isSubmittingNote || isAddingPhotos || (!newNote.trim() && newPhotos.length === 0)}>
                  {isSubmittingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                  Add Activity
                </Button>
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
                                        <Image src={url} alt={`Activity photo ${i+1}`} width={100} height={100} className="rounded-md object-cover w-full aspect-square" />
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
              <Badge variant={getStatusVariant(job.status)}>{JOB_STATUS_DISPLAY[job.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {['IN_PROGRESS', 'WAITING_QUOTATION', 'WAITING_APPROVE', 'IN_REPAIR_PROCESS'].includes(job.status) && (
                <Button onClick={handleMarkAsDone} disabled={isSubmittingNote || isSavingTechReport} className="w-full">
                    {isSubmittingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    งานเรียบร้อย (Mark as Done)
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Timestamps</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between"><span>Created:</span> <span>{safeFormat(job.createdAt, 'PPp')}</span></p>
                  <p className="flex justify-between"><span>Last Activity:</span> <span>{safeFormat(job.lastActivityAt, 'PPp')}</span></p>
              </CardContent>
          </Card>
          <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Transfer Job</CardTitle></CardHeader>
              <CardContent>
                  <Button onClick={() => setIsTransferDialogOpen(true)} className="w-full" variant="outline">
                      <Send className="mr-2 h-4 w-4" /> Transfer to another Department
                  </Button>
              </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
          <DialogContent 
              onInteractOutside={(e) => {if (isTransferring) e.preventDefault()}}
              onEscapeKeyDown={(e) => {if (isTransferring) e.preventDefault()}}
          >
              <DialogHeader>
                  <DialogTitle>Transfer Job</DialogTitle>
                  <DialogDescription>
                      Select a destination department and add an optional note. The job status will be reset to 'RECEIVED'.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                      <Label htmlFor="department">New Department</Label>
                      <Select value={transferDepartment} onValueChange={(v) => setTransferDepartment(v as JobDepartment)}>
                          <SelectTrigger>
                              <SelectValue placeholder="Select a department" />
                          </SelectTrigger>
                          <SelectContent>
                              {JOB_DEPARTMENTS.filter(d => d !== job?.department).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="grid gap-2">
                      <Label htmlFor="note">Note (Optional)</Label>
                      <Textarea id="note" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Add a transfer note..." />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)} disabled={isTransferring}>Cancel</Button>
                  <Button onClick={handleTransferJob} disabled={isTransferring || !transferDepartment}>
                      {isTransferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm Transfer
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
