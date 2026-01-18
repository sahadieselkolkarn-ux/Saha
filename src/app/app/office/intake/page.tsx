"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { errorEmitter, FirestorePermissionError } from "@/firebase";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JOB_DEPARTMENTS } from "@/lib/constants";
import { Loader2, UploadCloud, X } from "lucide-react";
import type { Customer } from "@/lib/types";

const intakeSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  department: z.string().min(1, "Department is required"),
  description: z.string().min(1, "Description is required"),
});

export default function IntakePage() {
  const { profile, db, storage } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  
  const form = useForm<z.infer<typeof intakeSchema>>({
    resolver: zodResolver(intakeSchema),
  });

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    },
    (error) => {
        const permissionError = new FirestorePermissionError({ path: 'customers', operation: 'list' });
        errorEmitter.emit('permission-error', permissionError);
    });
    return () => unsubscribe();
  }, [db]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (photos.length + newFiles.length > 4) {
        toast({ variant: "destructive", title: "You can only upload up to 4 photos." });
        return;
      }
      const validFiles = newFiles.filter(file => {
          if (file.size > 2 * 1024 * 1024) {
              toast({ variant: "destructive", title: `File ${file.name} is too large.`, description: "Max size is 2MB." });
              return false;
          }
          return true;
      });

      setPhotos(prev => [...prev, ...validFiles]);
      const newPreviews = validFiles.map(file => URL.createObjectURL(file));
      setPhotoPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: z.infer<typeof intakeSchema>) => {
    if (!profile || !db || !storage) return;
    setIsSubmitting(true);
    
    const selectedCustomer = customers.find(c => c.id === values.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Customer not found." });
        setIsSubmitting(false);
        return;
    }

    const jobData = {
        ...values,
        customerSnapshot: { name: selectedCustomer.name, phone: selectedCustomer.phone },
        status: "RECEIVED",
        photos: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
    };

    addDoc(collection(db, "jobs"), jobData)
      .then(async (jobDocRef) => {
        try {
          // Upload photos and update the job doc
          const photoURLs = [];
          for (const photo of photos) {
              const photoRef = ref(storage, `jobs/${jobDocRef.id}/${Date.now()}-${photo.name}`);
              await uploadBytes(photoRef, photo);
              const url = await getDownloadURL(photoRef);
              photoURLs.push(url);
          }

          if (photoURLs.length > 0) {
            const updateData = { photos: photoURLs };
            await updateDoc(jobDocRef, updateData).catch(error => {
                const permissionError = new FirestorePermissionError({ path: jobDocRef.path, operation: 'update', requestResourceData: updateData });
                errorEmitter.emit('permission-error', permissionError);
                // We can still proceed, but we should notify the user.
                toast({ variant: "destructive", title: "Failed to save photos to job", description: error.message });
            });
          }

          toast({ title: "Job created successfully", description: `Job ID: ${jobDocRef.id}` });
          router.push(`/app/jobs/${jobDocRef.id}`);
        } catch (error: any) {
          // This catches storage errors
          toast({ variant: "destructive", title: "Failed to upload photos", description: error.message });
          setIsSubmitting(false); // Stop loading if photo upload fails
        }
      })
      .catch(error => {
        const permissionError = new FirestorePermissionError({ path: 'jobs', operation: 'create', requestResourceData: jobData });
        errorEmitter.emit('permission-error', permissionError);
        toast({ variant: "destructive", title: "Failed to create job", description: error.message });
        setIsSubmitting(false);
      });
  };

  return (
    <>
      <PageHeader title="Job Intake" description="Create a new job for a customer." />
      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto">
              <FormField name="customerId" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger></FormControl>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} - {c.phone}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="department" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger></FormControl>
                    <SelectContent>{JOB_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="description" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Description / Symptoms</FormLabel>
                  <FormControl><Textarea placeholder="Describe the issue..." rows={5} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormItem>
                <FormLabel>Photos (up to 4, max 2MB each)</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-secondary">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      </div>
                      <Input id="dropzone-file" type="file" className="hidden" multiple accept="image/*" onChange={handlePhotoChange} disabled={photos.length >= 4} />
                    </label>
                  </div>
                </FormControl>
                {photoPreviews.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {photoPreviews.map((src, index) => (
                      <div key={index} className="relative">
                        <Image src={src} alt={`Preview ${index}`} width={150} height={150} className="rounded-md object-cover w-full aspect-square" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => removePhoto(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </FormItem>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Job
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
