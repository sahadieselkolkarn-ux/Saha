"use client";

import { PageHeader } from "@/components/page-header";
import { StoreSettingsForm } from "@/components/store-settings-form";

export default function ManagementSettingsStorePage() {
  return (
    <>
      <PageHeader title="ตั้งค่าร้าน/เวลา" description="ตั้งค่าข้อมูลทั่วไปของร้านและเวลาทำการ" />
      <div className="max-w-4xl mx-auto">
        <StoreSettingsForm />
      </div>
    </>
  );
}
