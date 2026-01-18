"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"
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
                        <SubNavLink href="/app/management/accounting" label="บริหารงานบัญชี" onClick={onLinkClick} />
                        <SubNavLink href="/app/management/hr" label="บริหารงานบุคคล" onClick={onLinkClick} />
                        <Collapsible defaultOpen={pathname.startsWith('/app/management/settings')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/management/settings') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9 text-muted-foreground text-sm">
                                    ตั้งค่า
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/management/settings/store" label="ตั้งค่าร้าน/เวลา" onClick={onLinkClick} />
                                <SubNavLink href="/app/management/settings/documents" label="ตั้งค่าเลขที่เอกสาร" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                    </>
                )}
                {department === 'OFFICE' && (
                    <>
                        <SubNavLink href="/app/office/customers/new" label="เพิ่มลูกค้า" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/customers" label="รายชื่อลูกค้า/ค้นหา" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/customers/tax" label="ภาษีลูกค้า" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/intake" label="เปิดงานใหม่ (Intake)" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/jobs/pending" label="งานรอดำเนินการ" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/jobs/waiting" label="งานรออะไหล่/รอส่งต่อ" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/jobs/closing" label="งานเสร็จรอปิด" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/payment/receive" label="รับเงินจากงาน" onClick={onLinkClick} />
                        <SubNavLink href="/app/office/payment/history" label="รายการรับเงิน" onClick={onLinkClick} />
                    </>
                )}
                {department === 'CAR_SERVICE' && (
                    <>
                        <Collapsible defaultOpen={pathname.startsWith('/app/car-service/queue')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/car-service/queue') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9">
                                    คิวงาน
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/car-service/queue/new" label="งานใหม่" onClick={onLinkClick} />
                                <SubNavLink href="/app/car-service/queue/in-progress" label="กำลังทำ" onClick={onLinkClick} />
                                <SubNavLink href="/app/car-service/queue/done" label="เสร็จแล้ว" onClick={onLinkClick} />
                                <SubNavLink href="/app/car-service/queue/closed" label="ปิดงาน" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/car-service/jobs/list" label="งานของแผนก" onClick={onLinkClick} />
                        <SubNavLink href="/app/car-service/jobs/transfer/commonrail" label="ส่งต่อ COMMONRAIL" onClick={onLinkClick} />
                        <SubNavLink href="/app/car-service/jobs/transfer/mechanic" label="ส่งต่อ MECHANIC" onClick={onLinkClick} />
                        <SubNavLink href="/app/car-service/jobs/outsource" label="ส่ง OUTSOURCE" onClick={onLinkClick} />
                    </>
                )}
                {department === 'COMMONRAIL' && (
                     <>
                        <Collapsible defaultOpen={pathname.startsWith('/app/commonrail/queue')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/commonrail/queue') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9">
                                    คิวงาน
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/commonrail/queue/new" label="งานใหม่" onClick={onLinkClick} />
                                <SubNavLink href="/app/commonrail/queue/in-progress" label="กำลังทำ" onClick={onLinkClick} />
                                <SubNavLink href="/app/commonrail/queue/done" label="เสร็จแล้ว" onClick={onLinkClick} />
                                <SubNavLink href="/app/commonrail/queue/closed" label="ปิดงาน" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/commonrail/jobs/list" label="งานของแผนก" onClick={onLinkClick} />
                        <SubNavLink href="/app/commonrail/jobs/return" label="ส่งกลับ" onClick={onLinkClick} />
                    </>
                )}
                {department === 'MECHANIC' && (
                    <>
                        <Collapsible defaultOpen={pathname.startsWith('/app/mechanic/queue')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/mechanic/queue') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9">
                                    คิวงาน
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/mechanic/queue/new" label="งานใหม่" onClick={onLinkClick} />
                                <SubNavLink href="/app/mechanic/queue/in-progress" label="กำลังทำ" onClick={onLinkClick} />
                                <SubNavLink href="/app/mechanic/queue/done" label="เสร็จแล้ว" onClick={onLinkClick} />
                                <SubNavLink href="/app/mechanic/queue/closed" label="ปิดงาน" onClick={onLinkClick} />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/mechanic/jobs/list" label="งานของแผนก" onClick={onLinkClick} />
                        <SubNavLink href="/app/mechanic/jobs/return" label="ส่งกลับ" onClick={onLinkClick} />
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

            {DEPARTMENTS.map(dept => <DepartmentMenu key={dept} department={dept} onLinkClick={onLinkClick} />)}
        </nav>
    );
}
