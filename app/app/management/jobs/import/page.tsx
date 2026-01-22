import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportJobsPage() {
  return (
    <>
      <PageHeader title="Import Job History" description="Upload a CSV file to bulk-import past jobs." />
      
      <Card>
        <CardHeader>
          <CardTitle>CSV File Format</CardTitle>
          <CardDescription>Your CSV file must follow this format. The header row is required.</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-sm font-semibold">Required Headers:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">customerPhone,department,description,status,createdAt</code>
            <p className="text-sm font-semibold mt-4">Optional Headers:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">technicalReport,assigneeName</code>
            <p className="text-sm text-muted-foreground mt-2">
              - `customerPhone` must match an existing customer's phone number in the system.
              <br />
              - `department` must be one of: CAR_SERVICE, COMMONRAIL, MECHANIC, OUTSOURCE.
              <br />
              - `status` must be one of: RECEIVED, IN_PROGRESS, DONE, CLOSED.
              <br />
              - `createdAt` should be in `YYYY-MM-DD` format.
            </p>
             <p className="text-sm font-semibold mt-4">Example:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">
                customerPhone,department,description,status,createdAt<br />
                0812345678,CAR_SERVICE,"เปลี่ยนน้ำมันเครื่อง, เช็คระยะ",CLOSED,2023-01-15
            </code>
            <p className="font-bold text-destructive mt-4">Note: The import functionality is under development. This page is a placeholder for the format specification.</p>
        </CardContent>
      </Card>
    </>
  );
}
