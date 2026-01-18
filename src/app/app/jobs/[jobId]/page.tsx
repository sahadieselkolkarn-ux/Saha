"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, collection, query, where, Timestamp } from "firebase/firestore";
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
import { Loader2, User, Clock, Paperclip, UploadCloud, X } from "lucide-react";
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
        
        // Fetch users in the same department who are active
        const usersQuery = query(
            collection(db, "users"), 
            where("department", "==", jobData.department),
            where("status", "==", "ACTIVE")
        );
        onSnapshot(usersQuery, (snapshot) => {
          setUsersInDept(snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
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
  
  const canEdit = profile && job && (profile.department === 'MANAGEMENT' || profile.department === job.department);

  const handleUpdate = (field: string, value: any, secondField?: string, secondValue?: any) => {
    if (!jobId || !canEdit || !db) return;
    const jobDocRef = doc(db, "jobs", jobId as string);
    
    const updateData: {[key: string]: any} = { 
        [field]: value, 
        lastActivityAt: serverTimestamp() 
    };

    if(secondField) {
        updateData[secondField] = secondValue;
    }

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
    // Revoke the object URL to free up memory
    URL.revokeObjectURL(photoPreviews[index]);
    setNewPhotos(p => p.filter((_, i) => i !== index));
    setPhotoPreviews(p => p.filter((_, i) => i !== index));
  };
  
  const handleAddActivity = async () => {
    if ((!newNote.trim() && newPhotos.length === 0) || !jobId || !user || !profile || !db || !storage) return;
    setIsSubmitting(true);
    
    const jobDocRef = doc(db, "jobs", jobId as string);
    let updateData: any;

    try {
        const photoURLs: string[] = [];
        for (const photo of newPhotos) {
            const photoRef = ref(storage, `jobs/${jobId}/activity/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            photoURLs.push(await getDownloadURL(photoRef));
        }

        const newActivity: JobActivity = {
            text: newNote,
            userName: profile.displayName,
            userId: user.uid,
            createdAt: serverTimestamp() as Timestamp, // Cast for type consistency
            photos: photoURLs,
        };
        
        updateData = { 
            activities: arrayUnion(newActivity),
            photos: arrayUnion(...photoURLs),
            lastActivityAt: serverTimestamp() 
        };
        
        await updateDoc(jobDocRef, updateData)
          .catch(error => {
            const permissionError = new FirestorePermissionError({
                path: jobDocRef.path,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
            throw error;
          });

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
          
          {canEdit && (
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
          )}

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
              <Select value={job.status} onValueChange={(v) => handleUpdate('status', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">Assigned To</CardTitle>
              {job.assigneeName && <Badge variant="outline">{job.assigneeName}</Badge>}
            </CardHeader>
            <CardContent>
              <Select 
                value={job.assigneeUid || ""} 
                onValueChange={(v) => {
                    const selectedUser = usersInDept.find(u => u.uid === v);
                    handleUpdate('assigneeUid', v, 'assigneeName', selectedUser?.displayName || "");
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
              <CardHeader><CardTitle className="text-base font-semibold">Timestamps</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between"><span>Created:</span> <span>{format((job.createdAt as Timestamp).toDate(), 'PPp')}</span></p>
                  <p className="flex justify-between"><span>Last Activity:</span> <span>{format((job.lastActivityAt as Timestamp).toDate(), 'PPp')}</span></p>
              </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
