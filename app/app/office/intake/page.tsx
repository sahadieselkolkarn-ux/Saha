"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JOB_DEPARTMENTS } from "@/lib/constants";
import { Loader2, Camera, X, ChevronsUpDown, PlusCircle } from "lucide-react";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deptLabel } from "@/lib/ui-labels";

const intakeSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  department: z.enum(JOB_DEPARTMENTS, { required_error: "กรุณาเลือกแผนก" }),
  description: z.string().min(1, "กรุณากรอกรายละเอียดงาน"),
  carServiceDetails: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    licensePlate: z.string().optional(),
  }).optional(),
  commonrailDetails: z.object({
    brand: z.string().optional(),
    partNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
  }).optional(),
  mechanicDetails: z.object({
    brand: z.string().optional(),
    partNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
  }).optional(),
});

export default function IntakePage() {
  const { db, storage } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  
  const form = useForm<z.infer<typeof intakeSchema>>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      customerId: "",
      description: "",
      carServiceDetails: { brand: '', model: '', licensePlate: '' },
      commonrailDetails: { brand: '', partNumber: '', registrationNumber: '' },
      mechanicDetails: { brand: '', partNumber: '', registrationNumber: '' },
    }
  });

  const selectedDepartment = form.watch("department");

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) {
      return customers;
    }
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        customer.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "customers"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    },
    (error) => {
        console.error("Error fetching customers:", error);
    });
    return () => unsubscribe();
  }, [db]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (photos.length + newFiles.length > 4) {
        toast({ variant: "destructive", title: "คุณสามารถอัปโหลดรูปภาพได้สูงสุด 4 รูปเท่านั้น" });
        return;
      }
      const validFiles = newFiles.filter(file => {
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
              toast({ variant: "destructive", title: `ไฟล์ ${file.name} มีขนาดใหญ่เกินไป`, description: "ขนาดสูงสุดคือ 5MB" });
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
    if (!db || !storage || !profile) return;

    const selectedCustomer = customers.find(c => c.id === values.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "ไม่พบข้อมูลลูกค้า" });
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        const batch = writeBatch(db);
        
        const jobDocRef = doc(collection(db, "jobs"));
        const jobId = jobDocRef.id;

        const photoURLs: string[] = [];
        for (const photo of photos) {
            const photoRef = ref(storage, `jobs/${jobId}/${Date.now()}-${photo.name}`);
            await uploadBytes(photoRef, photo);
            const url = await getDownloadURL(photoRef);
            photoURLs.push(url);
        }

        const marketingSource = selectedCustomer.acquisitionSource || 'EXISTING';
        const isActuallyNew = marketingSource !== 'EXISTING' && marketingSource !== 'NONE';

        const jobData = {
            id: jobId,
            customerId: values.customerId,
            department: values.department,
            description: values.description,
            customerSnapshot: { 
              name: selectedCustomer.name, 
              phone: selectedCustomer.phone, 
              useTax: selectedCustomer.useTax,
              id: selectedCustomer.id 
            },
            status: "RECEIVED",
            customerType: isActuallyNew ? 'NEW' : 'EXISTING',
            customerAcquisitionSource: marketingSource,
            photos: photoURLs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastActivityAt: serverTimestamp(),
        } as any;

        if (values.department === 'CAR_SERVICE') {
          jobData.carServiceDetails = values.carServiceDetails;
        }
        if (values.department === 'COMMONRAIL') {
          jobData.commonrailDetails = values.commonrailDetails;
        }
        if (values.department === 'MECHANIC') {
            jobData.mechanicDetails = values.mechanicDetails;
        }

        batch.set(jobDocRef, jobData);
        
        const activityDocRef = doc(collection(db, "jobs", jobId, "activities"));
        batch.set(activityDocRef, {
            text: `เปิดงานใหม่ในแผนก ${deptLabel(values.department)}`,
            userName: profile.displayName,
            userId: profile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });

        await batch.commit();

        toast({ title: "สร้างใบงานสำเร็จ", description: `รหัสงาน: ${jobId}` });
        
        form.reset();
        setPhotos([]);
        photoPreviews.forEach(url => URL.revokeObjectURL(url));
        setPhotoPreviews([]);
        setCustomerSearch("");

    } catch (error: any) {
        toast({ variant: "destructive", title: "สร้างงานไม่สำเร็จ", description: error.message });
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
      <PageHeader title="เปิดงานใหม่" description="สร้างใบงานใหม่สำหรับลูกค้าในระบบ" />
      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto">
              <div className="grid grid-cols-1 gap-6">
                <FormField
                  name="customerId"
                  control={form.control}
                  render={({ field }) => {
                    const selectedCustomer = field.value
                      ? customers.find(
                          (customer) => customer.id === field.value
                        )
                      : null;
                    return (
                      <FormItem className="flex flex-col">
                        <FormLabel>ลูกค้า (Customer)</FormLabel>
                        <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {selectedCustomer
                                  ? `${selectedCustomer.name} (${selectedCustomer.phone})`
                                  : "ค้นหาชื่อ หรือเบอร์โทรลูกค้า..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <div className="p-2">
                              <Input
                                autoFocus
                                placeholder="พิมพ์ชื่อ หรือเบอร์โทรเพื่อค้นหา..."
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                              />
                            </div>
                            <ScrollArea className="h-fit max-h-60">
                              {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer) => (
                                  <Button
                                    variant="ghost"
                                    key={customer.id}
                                    onClick={() => {
                                      field.onChange(customer.id);
                                      setIsCustomerPopoverOpen(false);
                                      setCustomerSearch('');
                                    }}
                                    className="w-full justify-start h-auto py-2 px-3 border-b last:border-0 rounded-none"
                                  >
                                    <div className="flex flex-col items-start">
                                      <p className="font-medium">{customer.name}</p>
                                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                                    </div>
                                  </Button>
                                ))
                              ) : (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                  ไม่พบข้อมูลลูกค้าที่ค้นหา
                                </div>
                              )}
                            </ScrollArea>
                            <div className="border-t p-2">
                              <Button asChild variant="outline" className="w-full">
                                <Link href="/app/office/customers/new">
                                  <PlusCircle className="mr-2 h-4 w-4" />
                                  เพิ่มลูกค้าใหม่
                                </Link>
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <FormField name="department" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>แผนกที่รับผิดชอบ (Department)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="กรุณาเลือกแผนก..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {JOB_DEPARTMENTS.map(d => (
                        <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              {selectedDepartment === 'CAR_SERVICE' && (
                <Card className="bg-muted/30 border-dashed">
                    <CardHeader><CardTitle className="text-base">รายละเอียดรถยนต์</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField name="carServiceDetails.brand" control={form.control} render={({ field }) => (<FormItem><FormLabel>ยี่ห้อรถ</FormLabel><FormControl><Input placeholder="เช่น Toyota, Isuzu" {...field} /></FormControl><FormMessage /></FormItem>)} />
                          <FormField name="carServiceDetails.model" control={form.control} render={({ field }) => (<FormItem><FormLabel>รุ่นรถ</FormLabel><FormControl><Input placeholder="เช่น Revo, D-Max" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        <FormField name="carServiceDetails.licensePlate" control={form.control} render={({ field }) => (<FormItem><FormLabel>ทะเบียนรถ</FormLabel><FormControl><Input placeholder="เช่น 1กข 1234" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </CardContent>
                </Card>
              )}

              {(selectedDepartment === 'COMMONRAIL' || selectedDepartment === 'MECHANIC') && (
                 <Card className="bg-muted/30 border-dashed">
                    <CardHeader><CardTitle className="text-base">รายละเอียดชิ้นส่วน</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField 
                            name={selectedDepartment === 'COMMONRAIL' ? "commonrailDetails.brand" : "mechanicDetails.brand"} 
                            control={form.control} 
                            render={({ field }) => (<FormItem><FormLabel>ยี่ห้อ</FormLabel><FormControl><Input placeholder="เช่น Denso, Bosch" {...field} /></FormControl><FormMessage /></FormItem>)} 
                          />
                          <FormField 
                            name={selectedDepartment === 'COMMONRAIL' ? "commonrailDetails.registrationNumber" : "mechanicDetails.registrationNumber"} 
                            control={form.control} 
                            render={({ field }) => (<FormItem><FormLabel>เลขทะเบียนชิ้นส่วน</FormLabel><FormControl><Input placeholder="Registration Number" {...field} /></FormControl><FormMessage /></FormItem>)} 
                          />
                        </div>
                        <FormField 
                          name={selectedDepartment === 'COMMONRAIL' ? "commonrailDetails.partNumber" : "mechanicDetails.partNumber"} 
                          control={form.control} 
                          render={({ field }) => (<FormItem><FormLabel>เลขอะไหล่ (Part Number)</FormLabel><FormControl><Input placeholder="ระบุหมายเลขอะไหล่..." {...field} /></FormControl><FormMessage /></FormItem>)} 
                        />
                    </CardContent>
                </Card>
              )}

              <FormField name="description" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>รายละเอียดงาน / อาการแจ้งซ่อม (Description)</FormLabel>
                  <FormControl><Textarea placeholder="ระบุรายละเอียดอาการเสีย หรือสิ่งที่ลูกค้าต้องการให้ทำ..." rows={5} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormItem>
                <FormLabel>รูปภาพประกอบ (สูงสุด 4 รูป, ไม่เกิน 5MB ต่อรูป)</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="intake-dropzone-file" className={cn(
                      "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors",
                      photos.length >= 4 ? 'cursor-not-allowed bg-muted/50 border-muted' : 'cursor-pointer bg-muted/50 hover:bg-secondary border-muted-foreground/20'
                    )}>
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Camera className="w-8 h-8 mb-2 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">กดที่นี่เพื่อถ่ายภาพ</span> หรือเลือกจากอัลบั้ม</p>
                             <p className="text-xs text-muted-foreground">รองรับไฟล์รูปภาพเท่านั้น</p>
                        </div>
                      <Input id="intake-dropzone-file" type="file" className="hidden" multiple accept="image/*" capture="environment" onChange={handlePhotoChange} disabled={photos.length >= 4} />
                    </label>
                  </div>
                </FormControl>
                {photoPreviews.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {photoPreviews.map((src, index) => (
                      <div key={index} className="relative group">
                        <Image src={src} alt={`Preview ${index + 1}`} width={150} height={150} className="rounded-md border object-cover w-full aspect-square" />
                        <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md" onClick={() => removePhoto(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </FormItem>

              <div className="pt-4">
                <Button type="submit" className="w-full h-12 text-lg font-semibold" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      กำลังบันทึกข้อมูล...
                    </>
                  ) : "สร้างใบงาน (Create Job)"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
