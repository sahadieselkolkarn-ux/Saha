"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, collection, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter, FirestorePermissionError } from "@/firebase";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JOB_STATUSES } from "@/lib/constants";
import { Loader2, User, Clock, MessageSquare, Paperclip, UploadCloud, X } from "lucide-react";
import type { Job, UserProfile, JobActivity } from "@/lib/types";
import { format } from 'date-fns';

export default function JobDetailsPage() {
  const { jobId } = useParams();
  const { profile, user, db, storage } = useAuth();
  const { toast } = useToast();
  
  const [job, setJob] = useState<Job | null>(null);
  const [usersInDept, setUsersInDept] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newNote, setNewNote] = useState("");
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    const unsubscribe = onSnapshot(jobDocRef, (doc) => {
      if (doc.exists()) {
        const jobData = { id: doc.id, ...doc.data() } as Job;
        setJob(jobData);
        
        // Fetch users in the same department
        const usersQuery = query(collection(db, "users"), where("department", "==", jobData.department));
        onSnapshot(usersQuery, (snapshot) => {
          setUsersInDept(snapshot.docs.map(d => d.data() as UserProfile));
        }, (error) => {
            const permissionError = new FirestorePermissionError({ path: `users`, operation: 'list' });
            errorEmitter.emit('permission-error', permissionError);
        });

      } else {
        toast({ variant: "destructive", title: "Job not found" });
      }
      setLoading(false);
    },
    (error) => {
      const permissionError = new FirestorePermissionError({ path: jobDocRef.path, operation: 'get' });
      errorEmitter.emit('permission-error', permissionError);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [jobId, toast, db]);
  
  const canEdit = profile && (profile.role === 'ADMIN' || profile.department === job?.department);

  const handleUpdate = (field: string, value: any) => {
    if (!jobId || !canEdit || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    const updateData = { [field]: value, lastActivityAt: serverTimestamp() };
    updateDoc(jobDocRef, updateData)
        .then(() => toast({ title: `Job ${field} updated` }))
        .catch(error => {
            const permissionError = new FirestorePermissionError({
                path: jobDocRef.path,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
        });
  };
  
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const totalPhotos = (job?.photos?.length || 0) + newPhotos.length + newFiles.length;
      if (totalPhotos > 4) {
        toast({ variant: "destructive", title: "You can only have up to 4 photos in total." });
        return;
      }
      // ... validation ...
      setNewPhotos(prev => [...prev, ...newFiles]);
      setPhotoPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    }
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(p => p.filter((_, i) => i !== index));
    setPhotoPreviews(p => p.filter((_, i) => i !== index));
  };
  
  const handleAddActivity = async () => {
    if (!newNote.trim() && newPhotos.length === 0) return;
    if (!jobId || !user || !profile || !db || !storage) return;
    setIsSubmitting(true);
    
    try {
        // 1. Upload photos
        const photoURLs = [];
        for (const photo of newPhotos) {
            const photoRef = ref(storage, `jobs/${jobId}/activity/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }

        // 2. Create activity object
        const newActivity: Omit<JobActivity, 'id'> = {
            text: newNote,
            userName: profile.displayName,
            userId: user.uid,
            createdAt: serverTimestamp() as any, // Cast for client-side creation
        };
        if(photoURLs.length > 0) newActivity.photos = photoURLs;
        
        // 3. Update job document
        const jobDocRef = doc(db, "jobs", jobId as string);
        const updateData = { 
            activities: arrayUnion(newActivity),
            photos: arrayUnion(...photoURLs),
            lastActivityAt: serverTimestamp() 
        };
        updateDoc(jobDocRef, updateData)
            .then(() => {
                setNewNote("");
                setNewPhotos([]);
                setPhotoPreviews([]);
                toast({title: "Activity added successfully"});
            })
            .catch(error => {
                 const permissionError = new FirestorePermissionError({
                    path: jobDocRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                });
                errorEmitter.emit('permission-error', permissionError);
                toast({variant: "destructive", title: "Failed to add activity", description: error.message});
            });

    } catch (error: any) {
        toast({variant: "destructive", title: "Failed to upload photos", description: error.message});
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!job) {
    return <PageHeader title="Job Not Found" />;
  }
  
  return (
    <>
      <PageHeader title={`Job: ${job.customerSnapshot.name}`} description={`ID: ${job.id}`} />
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><h4 className="font-semibold">Customer</h4><p>{job.customerSnapshot.name} ({job.customerSnapshot.phone})</p></div>
              <div><h4 className="font-semibold">Department</h4><p>{job.department}</p></div>
              <div><h4 className="font-semibold">Description</h4><p className="whitespace-pre-wrap">{job.description}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Photos</CardTitle></CardHeader>
            <CardContent>
                {job.photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {job.photos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <Image src={url} alt={`Job photo ${i+1}`} width={200} height={200} className="rounded-md object-cover w-full aspect-square hover:opacity-80 transition-opacity" />
                            </a>
                        ))}
                    </div>
                ) : <p className="text-muted-foreground">No photos uploaded yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {job.activities?.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map((activity, index) => (
                  <div key={index} className="flex gap-4">
                      <User className="h-5 w-5 mt-1 text-muted-foreground" />
                      <div className="flex-1">
                          <p className="font-semibold">{activity.userName} <span className="text-xs font-normal text-muted-foreground ml-2">{format(activity.createdAt.toDate(), 'PPpp')}</span></p>
                          <p className="whitespace-pre-wrap">{activity.text}</p>
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
              )) || <p className="text-muted-foreground">No activities yet.</p>}
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Add Note / Update</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Type your note here..." value={newNote} onChange={e => setNewNote(e.target.value)} />
                <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-secondary">
                        <div className="flex flex-col items-center justify-center">
                        <UploadCloud className="w-8 h-8 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Add Photos</p>
                        </div>
                        <Input id="dropzone-file" type="file" className="hidden" multiple accept="image/*" onChange={handlePhotoChange} disabled={((job.photos?.length || 0) + newPhotos.length) >= 4} />
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
                <Button onClick={handleAddActivity} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Activity
                </Button>
              </CardContent>
            </Card>
          )}

        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Status</CardTitle>
              <Badge variant="secondary">{job.status}</Badge>
            </CardHeader>
            <CardContent>
              <Select value={job.status} onValueChange={(v) => handleUpdate('status', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Assigned To</CardTitle>
              {job.assigneeName && <Badge variant="outline">{job.assigneeName}</Badge>}
            </CardHeader>
            <CardContent>
              <Select 
                value={job.assigneeUid || ""} 
                onValueChange={(v) => {
                    const selectedUser = usersInDept.find(u => u.uid === v);
                    handleUpdate('assigneeUid', v);
                    handleUpdate('assigneeName', selectedUser?.displayName || "");
                }}
                disabled={!canEdit}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {usersInDept.map(u => <SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
              <CardHeader><CardTitle>Timestamps</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                  <p className="flex justify-between"><span>Created:</span> <span className="text-muted-foreground">{format(job.createdAt.toDate(), 'PPp')}</span></p>
                  <p className="flex justify-between"><span>Last Activity:</span> <span className="text-muted-foreground">{format(job.lastActivityAt.toDate(), 'PPp')}</span></p>
              </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
