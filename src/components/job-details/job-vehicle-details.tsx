
"use client";

import type { Job } from "@/lib/types";

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
  // Show details if they exist, regardless of the current department
  const hasCarDetails = !!(job.carServiceDetails?.brand || job.carServiceDetails?.licensePlate);
  const hasCommonrailDetails = !!(job.commonrailDetails?.brand || job.commonrailDetails?.partNumber);
  const hasMechanicDetails = !!(job.mechanicDetails?.brand || job.mechanicDetails?.partNumber);

  return (
    <div className="space-y-1">
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
      {!hasCarDetails && !hasCommonrailDetails && !hasMechanicDetails && (
        <p className="text-xs text-muted-foreground italic">ไม่มีข้อมูลรายละเอียดรถ/ชิ้นส่วน</p>
      )}
    </div>
  );
}
