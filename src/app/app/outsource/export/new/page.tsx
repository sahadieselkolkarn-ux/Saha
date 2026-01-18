import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OutsourceExportNewPage() {
  return (
    <>
      <PageHeader title="สร้างรายการส่งออก" description="บันทึกการส่งต่องานซ่อมให้ร้านนอก" />
      <Card>
        <CardHeader>
          <CardTitle>วิธีการส่งต่องานไป Outsource</CardTitle>
          <CardDescription>
            ในเวอร์ชันปัจจุบัน การส่งงานไป Outsource จะทำผ่านหน้ารายละเอียดงาน (Job Detail)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
            <p>1. ไปที่หน้ารายละเอียดของงานที่ต้องการส่งต่อ</p>
            <p>2. ในส่วน &quot;Transfer Job&quot; ด้านขวามือ ให้กดปุ่ม &quot;Transfer to another Department&quot;</p>
            <p>3. เลือก Department เป็น &quot;OUTSOURCE&quot;</p>
            <p>4. (สำคัญ) ในช่อง Note ให้ระบุรายละเอียดร้านที่ส่ง, วันที่ส่ง, วันนัดรับ และข้อมูลอื่นๆ ที่จำเป็น</p>
            <p>5. กด &quot;Confirm Transfer&quot; งานจะย้ายมาอยู่ในสถานะ &quot;รอส่ง&quot; ของแผนก Outsource</p>
        </CardContent>
      </Card>
    </>
  );
}
