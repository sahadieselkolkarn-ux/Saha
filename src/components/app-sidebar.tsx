"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Clock,
  BarChart,
  Settings,
  Building,
  ClipboardPenLine,
  QrCode,
  Camera,
  LogOut,
  User,
  ChevronDown
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const NavLink = ({ href, label, icon: Icon, className }: { href: string; label: string; icon: React.ElementType; className?: string }) => {
    const pathname = usePathname();
    // Check if the current path is exactly the href or starts with it (for nested routes)
    const isActive = pathname === href || (href !== "/app/jobs" && pathname.startsWith(href));
    const isJobsActive = pathname.startsWith('/app/jobs') && href.startsWith('/app/jobs');


    return (
        <Button
            asChild
            variant={isActive || isJobsActive ? "secondary" : "ghost"}
            className={cn("w-full justify-start", className)}
        >
            <Link href={href}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
            </Link>
        </Button>
    );
};

const CollapsibleNavLink = ({ label, icon: Icon, children, basePath }: { label: string; icon: React.ElementType; children: React.ReactNode, basePath: string }) => {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = React.useState(pathname.startsWith(basePath));

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <Button variant={pathname.startsWith(basePath) ? "secondary" : "ghost"} className="w-full justify-between">
                    <span className="flex items-center">
                        <Icon className="mr-2 h-4 w-4" />
                        {label}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6 space-y-1 py-1">
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

export function AppSidebar() {
  const { profile, signOut } = useAuth();

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <div className="flex h-full flex-col px-4 py-6">
        <Logo />
        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">
            <NavLink href="/app/dashboard" label="Dashboard" icon={LayoutDashboard} />
            <NavLink href="/app/office/customers" label="Customers" icon={Users} />

            <CollapsibleNavLink label="Jobs" icon={Briefcase} basePath="/app/jobs">
                 <NavLink href="/app/office/intake" label="New Job" icon={ClipboardPenLine} />
                 <NavLink href="/app/jobs" label="All Jobs" icon={Briefcase} />
                 <NavLink href="/app/jobs?status=RECEIVED" label="Received" icon={ClipboardPenLine} />
                 <NavLink href="/app/jobs?status=IN_PROGRESS" label="In Progress" icon={ClipboardPenLine} />
                 <NavLink href="/app/jobs?status=DONE" label="Done" icon={ClipboardPenLine} />
                 <NavLink href="/app/jobs?status=CLOSED" label="Closed" icon={ClipboardPenLine} />
                 <NavLink href="/app/jobs/history" label="Job History" icon={Clock} />
            </CollapsibleNavLink>
            
            <CollapsibleNavLink label="Attendance" icon={Clock} basePath="/app/kiosk">
                <NavLink href="/app/kiosk/office" label="Kiosk Office" icon={QrCode} />
                <NavLink href="/app/kiosk/front" label="Kiosk Outside" icon={QrCode} />
                <NavLink href="/app/scan" label="Scan Time" icon={Camera} />
                <NavLink href="/app/attendance" label="History" icon={Clock} />
            </CollapsibleNavLink>

            <NavLink href="/app/reports" label="Reports" icon={BarChart} />
            <NavLink href="/app/settings" label="Settings" icon={Settings} />
        </nav>

        {profile && (
            <div className="mt-auto pt-4">
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
                            <Link href="/app/settings"><User className="mr-2 h-4 w-4"/> Profile</Link>
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
