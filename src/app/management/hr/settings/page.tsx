

"use client";

import { PageHeader } from "@/components/page-header";
import { HRSettingsForm } from "@/components/hr-settings-form";

export default function ManagementHRSettingsPage() {
  return (
    <>
      <PageHeader
        title="ตั้งค่า HR"
        description="ตั้งค่าการทำงาน, การลา, และการคำนวณเงินเดือน"
      />
      <HRSettingsForm />
    </>
  );
}

