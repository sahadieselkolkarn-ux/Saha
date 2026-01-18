"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Briefcase,
  ClipboardPenLine,
  Building,
  QrCode,
  Camera,
  LogOut,
  User,
  Settings
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const officeMenuItems = [
    {
        href: "/app/office/customers",
        label: "Customers",
        icon: Building,
    },
    {
        href: "/app/office/intake",
        label: "Job Intake",
        icon: ClipboardPenLine,
    },
]

const workshopMenuItems = [
    {
        href: "/app/jobs",
        label: "Jobs",
        icon: Briefcase,
    },
]

const timeMenuItems = [
     {
        href: "/app/scan",
        label: "Scan Time",
        icon: Camera,
    },
    {
        href: "/app/kiosk/office",
        label: "Kiosk Office",
        icon: QrCode,
    },
    {
        href: "/app/kiosk/front",
        label: "Kiosk Front",
        icon: QrCode,
    },
]


export function AppSidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth();

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  const NavLink = ({ href, label, icon: Icon }: { href: string, label: string, icon: React.ElementType }) => (
     <li>
        <Button
          asChild
          variant={pathname.startsWith(href) ? "secondary" : "ghost"}
          className="w-full justify-start"
        >
          <Link href={href}>
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </Link>
        </Button>
      </li>
  )

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <div className="flex flex-col px-4 py-6 flex-1">
        <Logo />
        <nav className="mt-6 flex-1">
            <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Office</h3>
            <ul className="space-y-1">
                {officeMenuItems.map((item) => <NavLink key={item.href} {...item} />)}
            </ul>
            <Separator className="my-4" />
            <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Workshop</h3>
            <ul className="space-y-1">
                {workshopMenuItems.map((item) => <NavLink key={item.href} {...item} />)}
            </ul>
            <Separator className="my-4" />
            <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time & Kiosk</h3>
            <ul className="space-y-1">
                {timeMenuItems.map((item) => <NavLink key={item.href} {...item} />)}
            </ul>
        </nav>

        {profile && (
            <div className="mt-auto">
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-auto p-2">
                             <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${profile.name}`} />
                                    <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <p className="text-sm font-medium leading-none">{profile.name}</p>
                                    <p className="text-xs text-muted-foreground">{profile.email}</p>
                                </div>
                             </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 mb-2" align="start">
                        <DropdownMenuLabel>{profile.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/app/me"><User className="mr-2 h-4 w-4"/> Profile</Link>
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
