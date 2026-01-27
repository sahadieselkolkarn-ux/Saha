
"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, serverTimestamp, doc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import type { SSOHospital } from "@/lib/types";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PlusCircle, Edit, Trash2 } from "lucide-react";

const hospitalSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อโรงพยาบาล"),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
});

type HospitalFormData = z.infer<typeof hospitalSchema>;

function HospitalFormDialog({ hospital, onSave, onOpenChange, open }: { hospital?: WithId<SSOHospital> | null, onSave: (data: HospitalFormData, id?: string) => Promise<void>, onOpenChange: (open: boolean) => void, open: boolean }) {
  const form = useForm<HospitalFormData>({
    resolver: zodResolver(hospitalSchema),
    defaultValues: {
      name: hospital?.name || "",
      address: hospital?.address || "",
      emergencyContact: hospital?.emergencyContact || "",
    },
  });

  const handleSubmit = async (data: HospitalFormData) => {
    await onSave(data, hospital?.id);
    form.reset();
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hospital ? "แก้ไขข้อมูลโรงพยาบาล" : "เพิ่มโรงพยาบาลใหม่"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id="hospital-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>ชื่อโรงพยาบาล</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
            <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>ที่อยู่</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage/></FormItem>)} />
            <FormField control={form.control} name="emergencyContact" render={({ field }) => (<FormItem><FormLabel>เบอร์ติดต่อฉุกเฉิน</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>ยกเลิก</Button>
          <Button type="submit" form="hospital-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 animate-spin"/>}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SsoHospitalsPage() {
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHospital, setEditingHospital] = useState<WithId<SSOHospital> | null>(null);
  const [deletingHospital, setDeletingHospital] = useState<WithId<SSOHospital> | null>(null);

  const hospitalsQuery = useMemo(() => db ? query(collection(db, 'ssoHospitals'), orderBy('name', 'asc')) : null, [db]);
  const { data: hospitals, isLoading, error } = useCollection<WithId<SSOHospital>>(hospitalsQuery);

  const hasPermission = useMemo(() => profile?.role === 'ADMIN' || profile?.department === 'MANAGEMENT', [profile]);

  const handleSave = async (data: HospitalFormData, id?: string) => {
    if (!db) return;
    try {
      if (id) {
        await updateDoc(doc(db, 'ssoHospitals', id), data);
        toast({ title: 'บันทึกการแก้ไขสำเร็จ' });
      } else {
        await addDoc(collection(db, 'ssoHospitals'), { ...data, createdAt: serverTimestamp() });
        toast({ title: 'เพิ่มโรงพยาบาลสำเร็จ' });
      }
      setIsFormOpen(false);
      setEditingHospital(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    }
  };

  const handleDelete = async () => {
    if (!db || !deletingHospital) return;
    try {
      await deleteDoc(doc(db, 'ssoHospitals', deletingHospital.id));
      toast({ title: 'ลบโรงพยาบาลสำเร็จ' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    } finally {
      setDeletingHospital(null);
    }
  };

  if (!profile) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin"/></div>
  }

  if (!hasPermission) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>ไม่มีสิทธิ์เข้าถึง</CardTitle>
                <CardDescription>สำหรับผู้ดูแลระบบและฝ่ายบริหารเท่านั้น</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <>
      <PageHeader title="โรงพยาบาลประกันสังคม" description="จัดการรายชื่อโรงพยาบาลสำหรับประกันสังคม">
        <Button onClick={() => { setEditingHospital(null); setIsFormOpen(true); }}><PlusCircle /> เพิ่มโรงพยาบาล</Button>
      </PageHeader>
      
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อโรงพยาบาล</TableHead>
                <TableHead>ที่อยู่</TableHead>
                <TableHead>เบอร์ติดต่อฉุกเฉิน</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="animate-spin"/></TableCell></TableRow>
              ) : hospitals && hospitals.length > 0 ? (
                hospitals.map(hospital => (
                  <TableRow key={hospital.id}>
                    <TableCell>{hospital.name}</TableCell>
                    <TableCell className="max-w-sm truncate">{hospital.address}</TableCell>
                    <TableCell>{hospital.emergencyContact}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingHospital(hospital); setIsFormOpen(true); }}><Edit className="h-4 w-4"/></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingHospital(hospital)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">ยังไม่มีข้อมูล</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {isFormOpen && (
        <HospitalFormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          hospital={editingHospital}
          onSave={handleSave}
        />
      )}

      <AlertDialog open={!!deletingHospital} onOpenChange={(open) => !open && setDeletingHospital(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ?</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบ "{deletingHospital?.name}" หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
