"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, updateDoc, setDoc, serverTimestamp, collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, LogOut, Edit, X, Key, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { PAY_TYPES } from "@/lib/constants";
import type { SSOHospital, GenAISettings } from "@/lib/types";
import type { WithId } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";

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
});

const aiSettingsSchema = z.object({
  geminiApiKey: z.string().min(1, "API Key is required"),
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
    const [isSavingAI, setIsSavingAI] = useState(false);

    const isManagerOrAdmin = profile?.role === 'MANAGER' || profile?.role === 'ADMIN';

    const aiSettingsRef = useMemo(() => (db ? doc(db, "settings", "ai") : null), [db]);
    const { data: aiSettings } = useDoc<GenAISettings>(aiSettingsRef);

    const form = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            displayName: '',
            phone: '',
        },
    });

    const aiForm = useForm<z.infer<typeof aiSettingsSchema>>({
        resolver: zodResolver(aiSettingsSchema),
        defaultValues: { geminiApiKey: "" },
    });

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
            });
        }
    }, [profile, form, isEditing]);

    useEffect(() => {
        if (aiSettings?.geminiApiKey) {
            aiForm.setValue("geminiApiKey", aiSettings.geminiApiKey);
        }
    }, [aiSettings, aiForm]);

    const onSubmitProfile = async (values: z.infer<typeof profileSchema>) => {
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
                updatedAt: serverTimestamp()
            };
            await updateDoc(doc(db, 'users', profile.uid), finalUpdate);
            toast({ title: "อัปเดตโปรไฟล์สำเร็จ" });
            setIsEditing(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Update failed", description: error.message });
        }
    };

    const onSaveAISettings = async (values: z.infer<typeof aiSettingsSchema>) => {
        if (!db || !profile) return;
        setIsSavingAI(true);
        try {
            await setDoc(doc(db, "settings", "ai"), {
                geminiApiKey: values.geminiApiKey.trim(),
                updatedAt: serverTimestamp(),
                updatedByUid: profile.uid,
                updatedByName: profile.displayName
            }, { merge: true });
            toast({ title: "บันทึก API Key สำหรับระบบ AI สำเร็จ" });
        } catch (e: any) {
            toast({ variant: "destructive", title: "บันทึกไม่สำเร็จ", description: e.message });
        } finally {
            setIsSavingAI(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut();
            router.push('/login');
        } catch (error: any) {
            toast({ variant: "destructive", title: "Logout failed", description: error.message });
        }
    };

    if (loading || !profile) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-12">
            <PageHeader title="โปรไฟล์และการตั้งค่า" description="จัดการข้อมูลส่วนตัวและระบบ AI ของร้าน" />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 border-2 border-primary/20">
                            <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile.displayName}`} />
                            <AvatarFallback>{profile.displayName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{profile.displayName}</CardTitle>
                            <CardDescription>{profile.email} • {profile.role}</CardDescription>
                        </div>
                    </div>
                    {!isEditing && <Button variant="outline" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> แก้ไขข้อมูล</Button>}
                </CardHeader>
                <CardContent className="space-y-4">
                    {isEditing ? (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmitProfile)} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField control={form.control} name="displayName" render={({ field }) => (<FormItem><FormLabel>ชื่อ-นามสกุล</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>เบอร์โทรศัพท์</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                                <div className="flex gap-2 justify-end pt-4">
                                    <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>ยกเลิก</Button>
                                    <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก</Button>
                                </div>
                            </form>
                        </Form>
                    ) : (
                        <div className="space-y-1">
                            <InfoRow label="เบอร์โทรศัพท์" value={profile.phone} />
                            <InfoRow label="แผนก" value={profile.department} />
                            <InfoRow label="ตำแหน่ง" value={profile.role} />
                        </div>
                    )}
                </CardContent>
            </Card>

            {isManagerOrAdmin && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <ShieldCheck className="h-5 w-5" />
                            การตั้งค่าระบบ AI (Internal AI System)
                        </CardTitle>
                        <CardDescription>จัดการรหัสสมองของน้องจิมมี่เพื่อให้ทำงานร่วมกับฐานข้อมูล Firebase ได้</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...aiForm}>
                            <form onSubmit={aiForm.handleSubmit(onSaveAISettings)} className="space-y-4">
                                <FormField control={aiForm.control} name="geminiApiKey" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2"><Key className="h-3 w-3" /> Gemini API Key</FormLabel>
                                        <FormControl>
                                            <div className="flex gap-2">
                                                <Input type="password" placeholder="ระบุ API Key เพื่อให้ระบบ AI ทำงาน..." {...field} className="bg-background" />
                                                <Button type="submit" disabled={isSavingAI}>
                                                    {isSavingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : "บันทึก"}
                                                </Button>
                                            </div>
                                        </FormControl>
                                        <FormDescription className="text-[10px]">
                                            รหัสนี้จะถูกเก็บเป็นความลับบน Server ของร้าน เพื่อให้น้องจิมมี่วิเคราะห์ข้อมูลธุรกิจได้ค่ะ
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle>การดำเนินการ</CardTitle></CardHeader>
                <CardContent>
                    <Button onClick={handleLogout} variant="outline" className="text-destructive border-destructive hover:bg-destructive/10">
                        <LogOut className="mr-2 h-4 w-4"/>
                        ออกจากระบบ
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
