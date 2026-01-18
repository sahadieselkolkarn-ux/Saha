"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
import Link from "next/link";

const intakeSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  department: z.string().min(1, "Department is required"),
  description: z.string().min(1, "Description is required"),
});

export default function IntakePage() {
  const { db, storage } = useFirebase();
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
        toast({ variant: "destructive", title: "Failed to load customers" });
    });
    return () => unsubscribe();
  }, [db, toast]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (photos.length + newFiles.length > 4) {
        toast({ variant: "destructive", title: "You can only upload up to 4 photos." });
        return;
      }
      const validFiles = newFiles.filter(file => {
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
              toast({ variant: "destructive", title: `File ${file.name} is too large.`, description: "Max size is 5MB." });
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
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: z.infer<typeof intakeSchema>) => {
    if (!db || !storage) return;

    const selectedCustomer = customers.find(c => c.id === values.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Customer not found." });
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        const jobData: any = {
            ...values,
            customerSnapshot: { name: selectedCustomer.name, phone: selectedCustomer.phone },
            status: "RECEIVED",
            photos: [], // will be updated after upload
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastActivityAt: serverTimestamp(),
            activities: [],
        };
    
        const jobDocRef = await addDoc(collection(db, "jobs"), jobData);
        const jobId = jobDocRef.id;

        const photoURLs: string[] = [];
        for (const photo of photos) {
            const photoRef = ref(storage, `jobs/${jobId}/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            const url = await getDownloadURL(photoRef);
            photoURLs.push(url);
        }

        await updateDoc(jobDocRef, {
            id: jobId,
            photos: photoURLs,
        });

        toast({ title: "Job created successfully", description: `Job ID: ${jobId}` });
        router.push(`/app/jobs/${jobId}`);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to create job", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

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
                   <div className="flex items-center gap-2">
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger></FormControl>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} - {c.phone}</SelectItem>)}</SelectContent>
                    </Select>
                     <Button variant="outline" asChild>
                        <Link href="/app/office/customers/new">New</Link>
                    </Button>
                  </div>
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
                <FormLabel>Photos (up to 4, max 5MB each)</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg ${photos.length >= 4 ? 'cursor-not-allowed bg-muted/50' : 'cursor-pointer bg-muted hover:bg-secondary'}`}>
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
