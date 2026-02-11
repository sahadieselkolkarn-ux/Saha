"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, collection, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase/client-provider";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Save, ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { sanitizeForFirestore } from "@/lib/utils";
import type { QuotationTemplate } from "@/lib/types";

const lineItemSchema = z.object({
  description: z.string().min(1, "ต้องกรอกรายละเอียด"),
  quantity: z.coerce.number().min(0.01),
  unitPrice: z.coerce.number().min(0),
  total: z.coerce.number(),
});

const templateFormSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ Template"),
  items: z.array(lineItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  discountAmount: z.coerce.number().min(0).optional(),
  withTax: z.boolean().default(true),
  notes: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

export function QuotationTemplateForm({ editTemplate }: { editTemplate?: QuotationTemplate }) {
  const router = useRouter();
  const { db } = useFirebase();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: editTemplate?.name || "",
      items: editTemplate?.items.map(i => ({ ...i })) || [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
      discountAmount: editTemplate?.discountAmount || 0,
      withTax: editTemplate?.withTax ?? true,
      notes: editTemplate?.notes || "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const total = (item.quantity || 0) * (item.unitPrice || 0);
      if (item.total !== total) {
        form.setValue(`items.${index}.total`, total);
      }
    });
  }, [watchedItems, form]);

  const onSubmit = async (data: TemplateFormData) => {
    if (!db || !profile) return;
    setIsSubmitting(true);
    try {
      const templateData = {
        ...data,
        updatedAt: serverTimestamp(),
        createdByUid: profile.uid,
        createdByName: profile.displayName,
      };

      if (editTemplate) {
        await updateDoc(doc(db, "quotationTemplates", editTemplate.id), sanitizeForFirestore(templateData));
      } else {
        const newRef = doc(collection(db, "quotationTemplates"));
        await setDoc(newRef, {
          ...sanitizeForFirestore(templateData),
          id: newRef.id,
          createdAt: serverTimestamp(),
        });
      }

      toast({ title: "บันทึก Template สำเร็จ" });
      router.push("/app/office/documents/quotation/templates");
    } catch (e: any) {
      toast({ variant: "destructive", title: "บันทึกไม่สำเร็จ", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex justify-between items-center">
          <Button type="button" variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> กลับ</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
            บันทึก Template
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>ข้อมูล Template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField name="name" control={form.control} render={({ field }) => (<FormItem><FormLabel>ชื่อ Template</FormLabel><FormControl><Input placeholder="เช่น ชุดเปลี่ยนถ่ายน้ำมันเครื่อง Revo" {...field} /></FormControl><FormMessage /></FormItem>)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>รายการมาตรฐาน</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32 text-right">จำนวน</TableHead><TableHead className="w-40 text-right">ราคา/หน่วย</TableHead><TableHead className="w-12"/></TableRow></TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell><FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<Input {...field} />)}/></TableCell>
                      <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" step="any" className="text-right" {...field} />)}/></TableCell>
                      <TableCell><FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (<Input type="number" step="any" className="text-right" {...field} />)}/></TableCell>
                      <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ description: "", quantity: 1, unitPrice: 0, total: 0 })}><PlusCircle className="mr-2 h-4 w-4"/> เพิ่มรายการ</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ข้อมูลประกอบ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField name="notes" control={form.control} render={({ field }) => (<FormItem><FormLabel>หมายเหตุเริ่มต้น</FormLabel><FormControl><Textarea {...field} rows={4} /></FormControl></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
              <FormField name="discountAmount" control={form.control} render={({ field }) => (<FormItem><FormLabel>ส่วนลดเริ่มต้น (บาท)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
              <FormField name="withTax" control={form.control} render={({ field }) => (<FormItem className="flex items-center gap-2 pt-8"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">รวมภาษีมูลค่าเพิ่ม 7%</FormLabel></FormItem>)} />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
