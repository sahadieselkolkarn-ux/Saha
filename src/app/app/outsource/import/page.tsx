import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OutsourceImportPage() {
  return (
    <>
        <PageHeader title="รับกลับเข้าระบบ" description="บันทึกการรับงานซ่อมกลับจากร้านนอก" />
        <Card>
            <CardHeader>
            <CardTitle>วิธีการรับงานกลับจาก Outsource</CardTitle>
            <CardDescription>
                ในเวอร์ชันปัจจุบัน การรับงานกลับและอัปเดตสถานะจะทำผ่านหน้ารายละเอียดงาน (Job Detail)
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <p>1. ไปที่หน้ารายละเอียดของงานที่รับกลับมา (สามารถหาได้จากเมนู &quot;ติดตาม&quot;)</p>
                <p>2. อัปเดตสถานะ (Status) ของงานเป็น &quot;DONE&quot; เพื่อบ่งบอกว่ารับกลับมาแล้ว</p>
                <p>3. (สำคัญ) ในส่วน &quot;Add Activity&quot; ให้เพิ่มบันทึกผลการซ่อมจากร้านนอก, แนบรูปภาพที่ได้รับ และข้อมูลอื่นๆ ที่จำเป็น</p>
                <p>4. เมื่อดำเนินการภายในเสร็จสิ้น สามารถเปลี่ยนสถานะเป็น &quot;CLOSED&quot; เพื่อปิดงานได้</p>
            </CardContent>
        </Card>
    </>
  );
}
