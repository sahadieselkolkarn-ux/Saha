"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"
import {
  Building, Factory, Wrench, Truck, Package, Landmark,
  ChevronDown, QrCode, Smartphone, Settings, LogOut, Clock, History, Presentation,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { DEPARTMENTS } from "@/lib/constants"
import type { Department } from "@/lib/constants"

// Helper components for navigation
const SubNavLink = ({ href, label }: { href: string; label: string; }) => {
    const pathname = usePathname();
    const isActive = pathname === href;
    return (
        <Button
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className="w-full justify-start text-muted-foreground text-sm h-9"
        >
            <Link href={href}>{label}</Link>
        </Button>
    );
};

const DepartmentMenu = ({ department }: { department: Department }) => {
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
                        <SubNavLink href="/app/management/overview" label="ภาพรวม" />
                        <SubNavLink href="/app/management/jobs/all" label="งานทั้งหมด" />
                        <SubNavLink href="/app/management/jobs/by-status" label="งานตามสถานะ" />
                        <SubNavLink href="/app/management/summary" label="สรุปวันนี้/สัปดาห์" />
                        <SubNavLink href="/app/management/customers/all" label="รายชื่อลูกค้า" />
                        <SubNavLink href="/app/management/customers/tax" label="ลูกค้าใช้ภาษี" />
                        <SubNavLink href="/app/management/jobs/history" label="ประวัติงาน/ค้นหา" />
                        <SubNavLink href="/app/management/accounting/revenue" label="รายรับ (เงินเข้า)" />
                        <SubNavLink href="/app/management/accounting/expenses" label="รายจ่าย (เงินออก)" />
                        <SubNavLink href="/app/management/accounting/debtors" label="ลูกหนี้" />
                        <SubNavLink href="/app/management/accounting/creditors" label="เจ้าหนี้" />
                        <SubNavLink href="/app/management/accounting/accounts" label="บัญชีเงินสด/ธนาคาร" />
                        <SubNavLink href="/app/management/hr/employees" label="ข้อมูลพนักงาน" />
                        <SubNavLink href="/app/management/hr/holidays" label="วันหยุด" />
                        <SubNavLink href="/app/management/hr/leaves" label="วันลา" />
                        <SubNavLink href="/app/management/hr/attendance-summary" label="สรุปลงเวลา" />
                        <SubNavLink href="/app/management/settings/store" label="ตั้งค่าร้าน/เวลา" />
                        <SubNavLink href="/app/management/settings/documents" label="ตั้งค่าเลขที่เอกสาร" />
                    </>
                )}
                {department === 'OFFICE' && (
                    <>
                        <SubNavLink href="/app/office/customers/new" label="เพิ่มลูกค้า" />
                        <SubNavLink href="/app/office/customers" label="รายชื่อลูกค้า/ค้นหา" />
                        <SubNavLink href="/app/office/customers/tax" label="ภาษีลูกค้า" />
                        <SubNavLink href="/app/office/intake" label="เปิดงานใหม่ (Intake)" />
                        <SubNavLink href="/app/office/jobs/pending" label="งานรอดำเนินการ" />
                        <SubNavLink href="/app/office/jobs/waiting" label="งานรออะไหล่/รอส่งต่อ" />
                        <SubNavLink href="/app/office/jobs/closing" label="งานเสร็จรอปิด" />
                        <SubNavLink href="/app/office/payment/receive" label="รับเงินจากงาน" />
                        <SubNavLink href="/app/office/payment/history" label="รายการรับเงิน" />
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
                                <SubNavLink href="/app/car-service/queue/new" label="งานใหม่" />
                                <SubNavLink href="/app/car-service/queue/in-progress" label="กำลังทำ" />
                                <SubNavLink href="/app/car-service/queue/done" label="เสร็จแล้ว" />
                                <SubNavLink href="/app/car-service/queue/closed" label="ปิดงาน" />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/car-service/jobs/list" label="งานของแผนก" />
                        <SubNavLink href="/app/car-service/jobs/transfer/commonrail" label="ส่งต่อ COMMONRAIL" />
                        <SubNavLink href="/app/car-service/jobs/transfer/mechanic" label="ส่งต่อ MECHANIC" />
                        <SubNavLink href="/app/car-service/jobs/outsource" label="ส่ง OUTSOURCE" />
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
                                <SubNavLink href="/app/commonrail/queue/new" label="งานใหม่" />
                                <SubNavLink href="/app/commonrail/queue/in-progress" label="กำลังทำ" />
                                <SubNavLink href="/app/commonrail/queue/done" label="เสร็จแล้ว" />
                                <SubNavLink href="/app/commonrail/queue/closed" label="ปิดงาน" />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/commonrail/jobs/list" label="งานของแผนก" />
                        <SubNavLink href="/app/commonrail/jobs/return" label="ส่งกลับ" />
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
                                <SubNavLink href="/app/mechanic/queue/new" label="งานใหม่" />
                                <SubNavLink href="/app/mechanic/queue/in-progress" label="กำลังทำ" />
                                <SubNavLink href="/app/mechanic/queue/done" label="เสร็จแล้ว" />
                                <SubNavLink href="/app/mechanic/queue/closed" label="ปิดงาน" />
                            </CollapsibleContent>
                        </Collapsible>
                        <SubNavLink href="/app/mechanic/jobs/list" label="งานของแผนก" />
                        <SubNavLink href="/app/mechanic/jobs/return" label="ส่งกลับ" />
                    </>
                )}
                 {department === 'OUTSOURCE' && (
                    <>
                        <SubNavLink href="/app/outsource/export/new" label="สร้างรายการส่งออก" />
                        <SubNavLink href="/app/outsource/import" label="รับกลับเข้าระบบ" />
                        <Collapsible defaultOpen={pathname.startsWith('/app/outsource/tracking')}>
                            <CollapsibleTrigger asChild>
                                <Button variant={pathname.startsWith('/app/outsource/tracking') ? "secondary" : "ghost"} className="w-full justify-between font-normal h-9">
                                    ติดตาม
                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="py-1 pl-4 space-y-1">
                                <SubNavLink href="/app/outsource/tracking/pending" label="รอส่ง" />
                                <SubNavLink href="/app/outsource/tracking/away" label="อยู่ร้านนอก" />
                                <SubNavLink href="/app/outsource/tracking/returned" label="รับกลับแล้ว" />
                            </CollapsibleContent>
                        </Collapsible>
                    </>
                )}
            </CollapsibleContent>
        </Collapsible>
    )
}


export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  const isAttendanceOpen = pathname.startsWith('/app/kiosk') || pathname.startsWith('/app/attendance');
  
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <div className="flex h-full max-h-screen flex-col">
        <div className="flex h-16 items-center border-b px-4">
            <Logo />
        </div>
        
        <div className="flex-1 overflow-y-auto py-2">
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
                        <SubNavLink href="/app/kiosk" label="Kiosk (คอมกลาง)" />
                        <SubNavLink href="/app/attendance/scan" label="Scan (มือถือ)" />
                        <SubNavLink href="/app/attendance/history" label="ประวัติลงเวลา" />
                    </CollapsibleContent>
                </Collapsible>
                
                <div className="my-2 border-t"></div>

                {DEPARTMENTS.map(dept => <DepartmentMenu key={dept} department={dept} />)}
            </nav>
        </div>

        {profile && (
            <div className="mt-auto border-t p-2">
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-auto p-2">
                             <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile.name}`} />
                                    <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left overflow-hidden">
                                    <p className="text-sm font-medium leading-none truncate">{profile.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                                </div>
                             </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 mb-2" align="start">
                        <DropdownMenuLabel>{profile.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/app/settings"><Settings className="mr-2 h-4 w-4"/> Profile & Settings</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={signOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )}
      </div>
    </aside>
  )
}
