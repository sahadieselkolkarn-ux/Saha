
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, updateDoc, serverTimestamp, collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, LogOut, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SSOHospital } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";
import { deptLabel, payTypeLabel } from "@/lib/ui-labels";
import { PAY_TYPES } from "@/lib/constants";


const profileSchema = z.object({
  displayName: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  personal: z.object({
    idCardNo: z.string().optional().default(''),
    address: z.string().optional().default(''),
    bank: z.object({
      bankName: z.string().optional().default(''),
      accountName: z.string().optional().default(''),
      accountNo: z.string().optional().default(''),
    }).optional(),
    emergencyContact: z.object({
      name: z.string().optional().default(''),
      relationship: z.string().optional().default(''),
      phone: z.string().optional().default(''),
    }).optional(),
  }).optional(),
  hr: z.object({
    salaryMonthly: z.coerce.number().optional(),
    payType: z.enum(PAY_TYPES).optional(),
    ssoHospital: z.string().optional().default(''),
    note: z.string().optional().default(''),
  }).optional(),
});


const InfoRow = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between py-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-sm sm:text-right break-words">{value || '-'}</div>
    </div>
)

export default function SettingsPage() {
    const { profile, signOut, loading } = useAuth();
    const { db } = useFirebase();
    const router = useRouter();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);

    const isManagerOrAdmin = profile?.role === 'MANAGER' || profile?.role === 'ADMIN';

    const [ssoHospitals, setSsoHospitals] = useState<WithId<SSOHospital>[]>([]);
    const [isLoadingHospitals, setIsLoadingHospitals] = useState(true);
    
    const form = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: {},
      });

    useEffect(() => {
        if (!db) return;
        setIsLoadingHospitals(true);
        const q = query(collection(db, "ssoHospitals"), orderBy("name", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSsoHospitals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithId<SSOHospital>)));
            setIsLoadingHospitals(false);
        }, (error) => {
            toast({ variant: "destructive", title: "Failed to load SSO hospitals" });
            setIsLoadingHospitals(false);
        });
        return () => unsubscribe();
    }, [db, toast]);

    useEffect(() => {
        if (profile) {
            form.reset({
                displayName: profile.displayName,
                phone: profile.phone,
                personal: {
                    idCardNo: profile.personal?.idCardNo || '',
                    address: profile.personal?.address || '',
                    bank: {
                        bankName: profile.personal?.bank?.bankName || '',
                        accountName: profile.personal?.bank?.accountName || '',
                        accountNo: profile.personal?.bank?.accountNo || '',
                    },
                    emergencyContact: {
                        name: profile.personal?.emergencyContact?.name || '',
                        relationship: profile.personal?.emergencyContact?.relationship || '',
                        phone: profile.personal?.emergencyContact?.phone || '',
                    }
                },
                hr: {
                    salaryMonthly: profile.hr?.salaryMonthly,
                    payType: profile.hr?.payType,
                    ssoHospital: profile.hr?.ssoHospital || '',
                    note: profile.hr?.note || ''
                }
            });
        }
    }, [profile, form, isEditing]); // Rerun when isEditing changes to reset form

    const onSubmit = async (values: z.infer<typeof profileSchema>) => {
        if (!db || !profile) return;

        try {
            const finalUpdate: any = {
                displayName: values.displayName,
                phone: values.phone,
                'personal.idCardNo': values.personal?.idCardNo || null,
                'personal.address': values.personal?.address || null,
                'personal.bank.bankName': values.personal?.bank?.bankName || null,
                'personal.bank.accountName': values.personal?.bank?.accountName || null,
                'personal.bank.accountNo': values.personal?.bank?.accountNo || null,
                'personal.emergencyContact.name': values.personal?.emergencyContact?.name || null,
                'personal.emergencyContact.relationship': values.personal?.emergencyContact?.relationship || null,
                'personal.emergencyContact.phone': values.personal?.emergencyContact?.phone || null,
                'hr.payType': values.hr?.payType || null,
                'hr.ssoHospital': values.hr?.ssoHospital || null,
                'hr.note': values.hr?.note || null,
                updatedAt: serverTimestamp()
            };

            if (isManagerOrAdmin) {
                finalUpdate['hr.salaryMonthly'] = values.hr?.salaryMonthly === undefined || (values.hr.salaryMonthly as any) === '' ? null : Number(values.hr.salaryMonthly);
            }

            const userDocRef = doc(db, 'users', profile.uid);
            await updateDoc(userDocRef, finalUpdate);

            toast({ title: "บันทึกข้อมูลสำเร็จ" });
            setIsEditing(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
        }
    };

    const handleLogout = async () => {
        try {
            await signOut();
            toast({ title: "ออกจากระบบสำเร็จ" });
            router.push('/login');
        } catch (error: any) {
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message });
        }
    };

    if (loading || !profile) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const getInitials = (name?: string) => {
        if (!name) return "?";
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    if (isEditing) {
        return (
            <>
                <PageHeader title="แก้ไขโปรไฟล์" description="อัปเดตข้อมูลส่วนตัวของคุณ" />
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto">
                        <ScrollArea className="max-h-[70vh] p-4">
                          <div className="space-y-6">
                            <Card>
                                <CardHeader><CardTitle>ข้อมูลบัญชี</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField control={form.control} name="displayName" render={({ field }) => (<FormItem><FormLabel>ชื่อที่แสดง</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>ข้อมูลส่วนตัว</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField control={form.control} name="personal.idCardNo" render={({ field }) => (<FormItem><FormLabel>เลขบัตรประชาชน</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="personal.address" render={({ field }) => (<FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <p className="font-medium text-sm pt-4">บัญชีธนาคาร</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                                        <FormField control={form.control} name="personal.bank.bankName" render={({ field }) => (<FormItem><FormLabel>ชื่อธนาคาร</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="personal.bank.accountName" render={({ field }) => (<FormItem><FormLabel>ชื่อบัญชี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="personal.bank.accountNo" render={({ field }) => (<FormItem><FormLabel>เลขบัญชี</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <p className="font-medium text-sm pt-4">ผู้ติดต่อฉุกเฉิน</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                                        <FormField control={form.control} name="personal.emergencyContact.name" render={({ field }) => (<FormItem><FormLabel>ชื่อ</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="personal.emergencyContact.relationship" render={({ field }) => (<FormItem><FormLabel>ความสัมพันธ์</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="personal.emergencyContact.phone" render={({ field }) => (<FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>ข้อมูลฝ่ายบุคคล</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="hr.salaryMonthly"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>เงินเดือน</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...field} disabled={!isManagerOrAdmin} value={field.value ?? ''} onChange={(e) => {
                                                    const value = e.target.value;
                                                    field.onChange(value === '' ? undefined : Number(value));
                                                }} />
                                            </FormControl>
                                            {!isManagerOrAdmin && <FormDescription>แก้ไขได้เฉพาะ Manager หรือ Admin เท่านั้น</FormDescription>}
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField name="hr.payType" control={form.control} render={({ field }) => (
                                        <FormItem><FormLabel>ประเภทการจ่ายเงิน</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger></FormControl><SelectContent>{Object.entries(payTypeLabel).map(([key, label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                    )} />
                                    <FormField
                                        control={form.control}
                                        name="hr.ssoHospital"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>โรงพยาบาลประกันสังคม</FormLabel>
                                             <Select
                                                onValueChange={field.onChange}
                                                value={field.value ?? ''}
                                                disabled={!isManagerOrAdmin || isLoadingHospitals}
                                                >
                                                <FormControl>
                                                    <SelectTrigger>
                                                    <SelectValue placeholder={isLoadingHospitals ? "กำลังโหลด..." : "เลือกโรงพยาบาล"} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {ssoHospitals.map((hospital) => (
                                                    <SelectItem key={hospital.id} value={hospital.name}>
                                                        {hospital.name}
                                                    </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {!isManagerOrAdmin && <FormDescription>แก้ไขได้เฉพาะ Manager หรือ Admin เท่านั้น</FormDescription>}
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField control={form.control} name="hr.note" render={({ field }) => (<FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                          </div>
                        </ScrollArea>
                        <div className="flex items-center gap-4 pt-6">
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                บันทึก
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                                <X className="mr-2 h-4 w-4" /> ยกเลิก
                            </Button>
                        </div>
                    </form>
                </Form>
            </>
        );
    }

    return (
        <>
            <PageHeader title="โปรไฟล์และการตั้งค่า" description="ดูและจัดการข้อมูลส่วนตัวของคุณ" />

            <div className="max-w-4xl mx-auto space-y-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile.displayName}`} alt={profile.displayName} />
                                <AvatarFallback>{getInitials(profile.displayName)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle className="text-2xl">{profile.displayName}</CardTitle>
                                <CardDescription>{profile.email}</CardDescription>
                            </div>
                        </div>
                        <Button variant="outline" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> แก้ไขโปรไฟล์</Button>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Separator />
                        <InfoRow label="เบอร์โทร" value={profile.phone} />
                        <Separator />
                        <InfoRow label="แผนก" value={deptLabel(profile.department)} />
                        <Separator />
                        <InfoRow label="ตำแหน่ง" value={profile.role} />
                        <Separator />
                        <InfoRow label="สถานะ" value={profile.status} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>ข้อมูลส่วนตัว</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <InfoRow label="เลขบัตรประชาชน" value={profile.personal?.idCardNo} />
                        <Separator />
                        <InfoRow label="ที่อยู่" value={<span className="whitespace-pre-wrap">{profile.personal?.address || '-'}</span>} />
                        <Separator />
                        <p className="font-medium pt-2">บัญชีธนาคาร</p>
                        <div className="pl-4">
                            <InfoRow label="ชื่อธนาคาร" value={profile.personal?.bank?.bankName} />
                            <InfoRow label="ชื่อบัญชี" value={profile.personal?.bank?.accountName} />
                            <InfoRow label="เลขบัญชี" value={profile.personal?.bank?.accountNo} />
                        </div>
                        <Separator />
                        <p className="font-medium pt-2">ผู้ติดต่อฉุกเฉิน</p>
                         <div className="pl-4">
                            <InfoRow label="ชื่อ" value={profile.personal?.emergencyContact?.name} />
                            <InfoRow label="ความสัมพันธ์" value={profile.personal?.emergencyContact?.relationship} />
                            <InfoRow label="เบอร์โทร" value={profile.personal?.emergencyContact?.phone} />
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader><CardTitle>ข้อมูลฝ่ายบุคคล</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <InfoRow label="วันที่เริ่มงาน" value={profile.hr?.startDate || '-'} />
                        <Separator />
                        <InfoRow label="วันที่สิ้นสุดการทำงาน" value={profile.hr?.endDate || 'ปัจจุบัน'} />
                        <Separator />
                        <InfoRow label="เงินเดือน" value={profile.hr?.salaryMonthly?.toLocaleString()} />
                        <Separator />
                         <InfoRow label="ประเภทการจ่ายเงิน" value={payTypeLabel(profile.hr?.payType)} />
                        <Separator />
                        <InfoRow label="โรงพยาบาลประกันสังคม" value={profile.hr?.ssoHospital} />
                        <Separator />
                        <InfoRow label="หมายเหตุ" value={<span className="whitespace-pre-wrap">{profile.hr?.note || '-'}</span>} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>การดำเนินการ</CardTitle></CardHeader>
                    <CardContent>
                        <Button onClick={handleLogout} variant="outline">
                            <LogOut className="mr-2 h-4 w-4"/>
                            ออกจากระบบ
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
