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
  // Check details across all possible structures including snapshots for archived jobs
  const car = job.carServiceDetails || job.carSnapshot;
  const commonrail = job.commonrailDetails || job.carSnapshot;
  const mechanic = job.mechanicDetails || job.carSnapshot;

  const hasCarDetails = !!(car?.brand || car?.licensePlate || car?.model);
  const hasPartsDetails = !!(commonrail?.brand || commonrail?.partNumber || commonrail?.registrationNumber);

  return (
    <div className="space-y-1">
      {hasCarDetails && (
        <>
          <DetailRow label="ยี่ห้อรถ" value={car?.brand} />
          <DetailRow label="รุ่นรถ" value={car?.model} />
          <DetailRow label="ทะเบียนรถ" value={car?.licensePlate} />
        </>
      )}
      {hasPartsDetails && !hasCarDetails && (
        <>
          <DetailRow label="ยี่ห้อ" value={commonrail?.brand} />
          <DetailRow label="เลขอะไหล่" value={commonrail?.partNumber} />
          <DetailRow label="เลขทะเบียนชิ้นส่วน" value={commonrail?.registrationNumber} />
        </>
      )}
      {!hasCarDetails && !hasPartsDetails && (
        <p className="text-xs text-muted-foreground italic">ไม่มีข้อมูลรายละเอียดรถ/ชิ้นส่วน</p>
      )}
    </div>
  );
}
