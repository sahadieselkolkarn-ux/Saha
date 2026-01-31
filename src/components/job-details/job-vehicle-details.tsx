
"use client";

import type { Job } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DetailRowProps {
  label: string;
  value?: string | null;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
};

export function JobVehicleDetails({ job }: { job: Job }) {
  const hasCarDetails = job.department === 'CAR_SERVICE' && job.carServiceDetails && (job.carServiceDetails.brand || job.carServiceDetails.model || job.carServiceDetails.licensePlate);
  const hasCommonrailDetails = job.department === 'COMMONRAIL' && job.commonrailDetails && (job.commonrailDetails.brand || job.commonrailDetails.partNumber || job.commonrailDetails.registrationNumber);
  const hasMechanicDetails = job.department === 'MECHANIC' && job.mechanicDetails && (job.mechanicDetails.brand || job.mechanicDetails.partNumber || job.mechanicDetails.registrationNumber);

  if (!hasCarDetails && !hasCommonrailDetails && !hasMechanicDetails) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>รายละเอียดเฉพาะแผนก</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {hasCarDetails && (
          <>
            <DetailRow label="ยี่ห้อรถ" value={job.carServiceDetails?.brand} />
            <DetailRow label="รุ่นรถ" value={job.carServiceDetails?.model} />
            <DetailRow label="ทะเบียนรถ" value={job.carServiceDetails?.licensePlate} />
          </>
        )}
        {hasCommonrailDetails && (
          <>
            <DetailRow label="ยี่ห้อ" value={job.commonrailDetails?.brand} />
            <DetailRow label="เลขอะไหล่" value={job.commonrailDetails?.partNumber} />
            <DetailRow label="เลขทะเบียน" value={job.commonrailDetails?.registrationNumber} />
          </>
        )}
        {hasMechanicDetails && (
           <>
            <DetailRow label="ยี่ห้อ" value={job.mechanicDetails?.brand} />
            <DetailRow label="เลขอะไหล่" value={job.mechanicDetails?.partNumber} />
            <DetailRow label="เลขทะเบียน" value={job.mechanicDetails?.registrationNumber} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
