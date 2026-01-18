"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JOB_DEPARTMENTS, JOB_STATUSES } from "@/lib/constants";
import { Loader2, User, Clock, Paperclip, UploadCloud, X, Send } from "lucide-react";
import type { Job, JobActivity, JobDepartment } from "@/lib/types";
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferDepartment, setTransferDepartment] = useState<JobDepartment | ''>('');
  const [transferNote, setTransferNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    if (!jobId || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    const unsubscribe = onSnapshot(jobDocRef, (doc) => {
      if (doc.exists()) {
        const jobData = { id: doc.id, ...doc.data() } as Job;
        setJob(jobData);
      } else {
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

  const handleUpdate = (field: string, value: any) => {
    if (!jobId || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    
    const updateData: {[key: string]: any} = { 
        [field]: value, 
        lastActivityAt: serverTimestamp() 
    };

    updateDoc(jobDocRef, updateData)
        .then(() => toast({ title: `Job ${field} updated` }))
        .catch(error => {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
        });
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
    if ((!newNote.trim() && newPhotos.length === 0) || !jobId || !db || !storage || !profile) return;
    setIsSubmitting(true);
    
    const jobDocRef = doc(db, "jobs", jobId as string);

    try {
        const photoURLs: string[] = [];
        for (const photo of newPhotos) {
            const photoRef = ref(storage, `jobs/${jobId}/activity/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }

        const newActivity: JobActivity = {
            text: newNote,
            userName: profile.name,
            userId: profile.uid,
            createdAt: serverTimestamp() as Timestamp, // Cast for type consistency
            photos: photoURLs,
        };
        
        const updateData = { 
            activities: arrayUnion(newActivity),
            photos: arrayUnion(...photoURLs),
            lastActivityAt: serverTimestamp() 
        };
        
        await updateDoc(jobDocRef, updateData);

        setNewNote("");
        setNewPhotos([]);
        setPhotoPreviews(p => {
            p.forEach(url => URL.revokeObjectURL(url));
            return [];
        });
        toast({title: "Activity added successfully"});

    } catch (error: any) {
        toast({variant: "destructive", title: "Failed to add activity", description: error.message});
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleTransferJob = async () => {
    if (!transferDepartment || !job || !db || !profile) return;
    setIsTransferring(true);
    const jobDocRef = doc(db, "jobs", job.id);

    try {
        const newActivity: JobActivity = {
            text: `Transferred from ${job.department} to ${transferDepartment}. Note: ${transferNote || 'N/A'}`,
            userName: profile.name,
            userId: profile.uid,
            createdAt: serverTimestamp() as Timestamp,
            photos: [],
        };

        const updateData: any = {
            department: transferDepartment,
            status: 'RECEIVED', // Reset status to RECEIVED for the new department
            activities: arrayUnion(newActivity),
            lastActivityAt: serverTimestamp(),
        };

        await updateDoc(jobDocRef, updateData);

        toast({ title: 'Job Transferred', description: `Job moved to ${transferDepartment} department.`});
        setIsTransferDialogOpen(false);
        setTransferNote('');
        setTransferDepartment('');
    } catch(error: any) {
        toast({ variant: "destructive", title: "Transfer Failed", description: error.message });
    } finally {
        setIsTransferring(false);
    }
  };
  
  const sortedActivities = [...(job?.activities || [])].sort((a,b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis());

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
              <div><h4 className="font-semibold text-base">Description</h4><p className="whitespace-pre-wrap">{job.description}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Photos ({job.photos.length}/4)</CardTitle></CardHeader>
            <CardContent>
                {job.photos.length > 0 ? (
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
                    <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg ${((job.photos?.length || 0) + newPhotos.length) >= 4 ? "bg-muted/50 cursor-not-allowed" : "cursor-pointer bg-muted hover:bg-secondary"}`}>
                        <div className="flex flex-col items-center justify-center">
                        <UploadCloud className="w-8 h-8 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Add Photos (up to 4 total)</p>
                        </div>
                        <Input id="dropzone-file" type="file" className="hidden" multiple accept="image/*" onChange={handlePhotoChange} disabled={((job.photos?.length || 0) + newPhotos.length) >= 4} />
                    </label>
                </div>
                {(photoPreviews.length > 0) && (
                  <div className="grid grid-cols-4 gap-2">
                    {photoPreviews.map((src, i) => (
                      <div key={i} className="relative">
                        <Image src={src} alt="preview" width={100} height={100} className="rounded-md object-cover w-full aspect-square" onUnload={() => URL.revokeObjectURL(src)} />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5" onClick={() => removeNewPhoto(i)}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={handleAddActivity} disabled={isSubmitting || (!newNote.trim() && newPhotos.length === 0)}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                  Add Activity
                </Button>
              </CardContent>
            </Card>

          <Card>
            <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {sortedActivities.length > 0 ? sortedActivities.map((activity, index) => (
                  <div key={index} className="flex gap-4">
                      <User className="h-5 w-5 mt-1 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                          <p className="font-semibold">{activity.userName} <span className="text-xs font-normal text-muted-foreground ml-2">{format((activity.createdAt as Timestamp).toDate(), 'PPpp')}</span></p>
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
              )) : <p className="text-muted-foreground text-sm">No activities yet.</p>}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">Status</CardTitle>
              <Badge variant={job.status === 'DONE' ? 'default' : job.status === 'CLOSED' ? 'destructive' : 'secondary'}>{job.status}</Badge>
            </CardHeader>
            <CardContent>
              <Select value={job.status} onValueChange={(v) => handleUpdate('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Timestamps</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between"><span>Created:</span> <span>{format((job.createdAt as Timestamp).toDate(), 'PPp')}</span></p>
                  <p className="flex justify-between"><span>Last Activity:</span> <span>{format((job.lastActivityAt as Timestamp).toDate(), 'PPp')}</span></p>
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
          <DialogContent>
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
                  <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>Cancel</Button>
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
