"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  BarChart,
  Settings,
  LogOut,
  User,
  BookUser,
  Landmark,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const NavLink = ({ href, label, icon: Icon, className, exact = false }: { href: string; label: string; icon: React.ElementType; className?: string, exact?: boolean }) => {
    const pathname = usePathname();
    const isActive = exact ? pathname === href : pathname.startsWith(href);

    return (
        <Button
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className={cn("w-full justify-start", className)}
        >
            <Link href={href}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
            </Link>
        </Button>
    );
};

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
            <NavLink href="/app/dashboard" label="Dashboard" icon={LayoutDashboard} exact />
            <NavLink href="/app/office/customers" label="Customers" icon={BookUser} />
            <NavLink href="/app/jobs" label="Jobs" icon={Briefcase} />
            <NavLink href="/app/attendance" label="Attendance" icon={Clock} exact />
            <NavLink href="/app/accounting" label="Accounting" icon={Landmark} exact />
            <NavLink href="/app/hr" label="HR" icon={Users} exact />
            <NavLink href="/app/reports" label="Reports" icon={BarChart} exact />
            <NavLink href="/app/settings" label="Settings" icon={Settings} exact />
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
