import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MyPayslipsPage() {
  return (
    <>
      <PageHeader title="ใบเงินเดือนของฉัน" description="ตรวจสอบสลิปเงินเดือนและกดยืนยัน" />
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            This page will allow you to view your draft payslips and approve them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>The functionality for viewing and accepting payslips is under development.</p>
        </CardContent>
      </Card>
    </>
  );
}
