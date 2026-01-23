"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React, { useMemo } from "react"
import {
  Building, Factory, Wrench, Truck, Package, Landmark,
  ChevronDown, QrCode, Smartphone, Settings, LogOut, Clock, History, Presentation,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { DEPARTMENTS } from "@/lib/constants"
import type { Department } from "@/lib/constants"
import { useAuth } from "@/context/auth-context"

// Helper components for navigation
const SubNavLink = ({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) => {
    const pathname = usePathname();
    const isActive = pathname === href;
    return (
        <Button
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className="w-full justify-start text-muted-foreground text-sm h-9"
            onClick={onClick}
        >
            <Link href={href}>{label}</Link>
        </Button>
    );
};

const AccountingSubMenu = ({ onLinkClick }: { onLinkClick?: () => void }) => {
    const pathname = usePathname();
    const isOpen = pathname.startsWith('/app/management/accounting');
    return (
        <Collapsible defaultOpen={isOpen}>
            <CollapsibleTrigger asChild>
                <Button variant={isOpen ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground text-sm">
                    บริหารงานบัญชี
                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="py-1 pl-4 space-y-1">
                <SubNavLink href="/app/management/accounting/revenue" label="รายรับ (เงินเข้า)" onClick={onLinkClick} />
                <SubNavLink href="/app/management/accounting/expenses" label="รายจ่าย (เงินออก)" onClick={onLinkClick} />
                <SubNavLink href="/app/management/accounting/debtors" label="ลูกหนี้" onClick={onLinkClick} />
                <SubNavLink href="/app/management/accounting/creditors" label="เจ้าหนี้" onClick={onLinkClick} />
                <SubNavLink href="/app/management/accounting/accounts" label="บัญชีเงินสด/ธนาคาร" onClick={onLinkClick} />
                <SubNavLink href="/app/management/accounting/payroll" label="เงินเดือน" onClick={onLinkClick} />
            </CollapsibleContent>
        </Collapsible>
    );
};

const HRSubMenu = ({ onLinkClick }: { onLinkClick?: () => void }) => {
    const pathname = usePathname();
    const isOpen = pathname.startsWith('/app/management/hr');
    return (
        <Collapsible defaultOpen={isOpen}>
            <CollapsibleTrigger asChild>
                <Button variant={isOpen ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground text-sm">
                    บริหารงานบุคคล
                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="py-1 pl-4 space-y-1">
                <SubNavLink href="/app/management/hr/employees" label="ผู้ใช้และพนักงาน" onClick={onLinkClick} />
                <SubNavLink href="/app/management/hr/settings" label="ตั้งค่า HR" onClick={onLinkClick} />
                <SubNavLink href="/app/management/hr/holidays" label="วันหยุด" onClick={onLinkClick} />
                <SubNavLink href="/app/management/hr/leaves" label="วันลา" onClick={onLinkClick} />
                <SubNavLink href="/app/management/hr/attendance-summary" label="สรุปลงเวลา" onClick={onLinkClick} />
            </CollapsibleContent>
        </Collapsible>
    );
};

const SettingsSubMenu = ({ onLinkClick }: { onLinkClick?: () => void }) => {
    const pathname = usePathname();
    const isOpen = pathname.startsWith('/app/management/settings');
    return (
        <Collapsible defaultOpen={isOpen}>
            <CollapsibleTrigger asChild>
                <Button variant={isOpen ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground text-sm">
                    ตั้งค่า
                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="py-1 pl-4 space-y-1">
                <SubNavLink href="/app/management/settings/store" label="ตั้งค่าร้าน/เวลา" onClick={onLinkClick} />
                <SubNavLink href="/app/management/settings/documents" label="ตั้งค่าเลขที่เอกสาร" onClick={onLinkClick} />
            </CollapsibleContent>
        </Collapsible>
    );
};


const DepartmentMenu = ({ department, onLinkClick }: { department: Department, onLinkClick?: () => void }) => {
    const pathname = usePathname();
    const departmentPath = `/app/${department.toLowerCase().replace('_', '-')}`
    const isOpen = pathname.startsWith(departmentPath)

    const icons: Record<Department, React.ElementType> = {
        MANAGEMENT: Building,
        OFFICE: Landmark,
        CAR_SERVICE: Truck,
        COMMONRAIL: Factory,
        MECHANIC: Wrench,
        OUTSOURCE: Package,
    };
    const Icon = icons[department];

    return (
        <Collapsible defaultOpen={isOpen}>
            <CollapsibleTrigger asChild>
                <Button variant={isOpen ? "secondary" : "ghost"} className="w-full justify-between">
                    <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {department}
                    </span>
                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="py-1 pl-6 space-y-1">
                {department === 'MANAGEMENT' && (
                    <>
                        <SubNavLink href="/app/management/overview" label="Dashboard" onClick={onLinkClick} />
                        <SubNavLink href="/app/management/jobs" label="ภาพรวมงานซ่อม" onClick={onLinkClick} />
                        <SubNavLink href="/app/management/customers" label="การจัดการลูกค้า" onClick={onLinkClick} />
                        <SubNavLink href="/app/management/jobs/history" label="ประวัติงาน/ค้นหา" onClick={onLinkClick} />
                        <AccountingSubMenu onLinkClick={onLinkClick} />
                        <HRSubMenu onLinkClick={onLinkClick} />
                        <SettingsSubMenu onLinkClick={onLinkClick} />
                    </>
                )}
                {department === 'OFFICE' && (
                     <>
                        <SubNavLink href="/app/office/intake" label="เปิดงานใหม่ (Intake)" onClick={onLinkClick} />
                        <Collapsible defaultOpen={pathname.startsWith('/app/office/jobs/management')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/office/jobs/management') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground">
                                    บริหารงานซ่อม
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/office/jobs/management/car-service" label="งานซ่อมหน้าร้าน" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/commonrail" label="งานแผนกคอมมอนเรล" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/mechanic" label="งานแผนกแมคคานิค" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/outsource" label="งานส่งออกร้านนอก" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/quotation" label="งานเสนอราคา" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/done" label="งานเสร็จรอทำบิล" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/pickup" label="รอลูกค้ารับสินค้า" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/jobs/management/history" label="ประวัติงานซ่อม" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/office/customers" label="รายชื่อลูกค้า" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/cash-drawer" label="เงินสดหน้าร้าน" onClick={onLinkClick} />

                        <Collapsible defaultOpen={pathname.startsWith('/app/office/documents')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/office/documents') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground">
                                    งานเอกสาร
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/office/documents/quotation" label="ใบเสนอราคา" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/documents/delivery-note" label="ใบส่งสินค้า" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/documents/tax-invoice" label="ใบกำกับภาษี" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible defaultOpen={pathname.startsWith('/app/office/parts')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/office/parts') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground">
                                    การจัดการอะไหล่
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/office/parts/withdraw" label="เบิกอะไหล่" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/parts/receive" label="รับอะไหล่" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/parts/list" label="รายการอะไหล่/ค้นหา" onClick={onLinkClick} />
                                <SubNavLink href="/app/office/parts/vendors" label="รายชื่อร้านค้า" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                    </>
                )}
                {department === 'CAR_SERVICE' && (
                    <>
                       <SubNavLink href="/app/car-service/jobs/all" label="งานทั้งหมด" onClick={onLinkClick} />
                       <SubNavLink href="/app/car-service/jobs/my" label="งานของฉัน" onClick={onLinkClick} />
                    </>
                )}
                {department === 'COMMONRAIL' && (
                    <>
                       <SubNavLink href="/app/commonrail/jobs/all" label="งานทั้งหมด" onClick={onLinkClick} />
                       <SubNavLink href="/app/commonrail/jobs/my" label="งานของฉัน" onClick={onLinkClick} />
                    </>
                )}
                {department === 'MECHANIC' && (
                    <>
                       <SubNavLink href="/app/mechanic/jobs/all" label="งานทั้งหมด" onClick={onLinkClick} />
                       <SubNavLink href="/app/mechanic/jobs/my" label="งานของฉัน" onClick={onLinkClick} />
                    </>
                )}
                 {department === 'OUTSOURCE' && (
                    <>
                        <SubNavLink href="/app/outsource/export/new" label="สร้างรายการส่งออก" onClick={onLinkClick} />
                        <SubNavLink href="/app/outsource/import" label="รับกลับเข้าระบบ" onClick={onLinkClick} />
                        <Collapsible defaultOpen={pathname.startsWith('/app/outsource/tracking')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/outsource/tracking') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9">
                                    ติดตาม
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/outsource/tracking/pending" label="รอส่ง" onClick={onLinkClick} />
                                <SubNavLink href="/app/outsource/tracking/away" label="อยู่ร้านนอก" onClick={onLinkClick} />
                                <SubNavLink href="/app/outsource/tracking/returned" label="รับกลับแล้ว" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                    </>
                )}
            </CollapsibleContent>
        </Collapsible>
    )
}

export function AppNav({ onLinkClick }: { onLinkClick?: () => void }) {
    const pathname = usePathname();
    const { profile } = useAuth();
    const isAttendanceOpen = pathname.startsWith('/app/kiosk') || pathname.startsWith('/app/attendance');

    const departmentsToShow = useMemo(() => {
        if (!profile) return [];

        if (profile.role === 'ADMIN') {
            return DEPARTMENTS;
        }

        const visible = new Set<Department>();
        
        // Add user's own department
        if (profile.department) {
            visible.add(profile.department);
        }

        // The special case for MANAGER and OFFICER has been removed to tighten security.
        // Now, only ADMINs or users assigned to the MANAGEMENT department can see its menu.

        // Return in the order defined in DEPARTMENTS
        return DEPARTMENTS.filter(d => visible.has(d));
    }, [profile]);

    return (
        <nav className="grid items-start px-2 text-sm font-medium">
            <Collapsible defaultOpen={isAttendanceOpen}>
                <CollapsibleTrigger asChild>
                    <Button variant={isAttendanceOpen ? "secondary" : "ghost"} className="w-full justify-between">
                        <span className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" />
                            QR ลงเวลา
                        </span>
                        <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="py-1 pl-6 space-y-1">
                    {profile?.role === 'OFFICER' && (
                        <SubNavLink href="/app/kiosk" label="Kiosk (คอมกลาง)" onClick={onLinkClick} />
                    )}
                    <SubNavLink href="/app/attendance/scan" label="Scan (มือถือ)" onClick={onLinkClick} />
                    <SubNavLink href="/app/attendance/history" label="ประวัติลงเวลา" onClick={onLinkClick} />
                </CollapsibleContent>
            </Collapsible>
            
            <div className="my-2 border-t"></div>

            {departmentsToShow.map(dept => <DepartmentMenu key={dept} department={dept} onLinkClick={onLinkClick} />)}
        </nav>
    );
}
