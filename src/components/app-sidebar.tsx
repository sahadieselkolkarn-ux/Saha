"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "firebase/auth"

import {
  Users,
  Briefcase,
  User,
  LogOut,
  ClipboardPenLine,
  Building,
  Wrench,
  Settings,
  QrCode
} from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AppSidebar() {
  const pathname = usePathname()
  const { profile, auth } = useAuth()

  if (!profile) return null

  const isAdmin = profile.role === "ADMIN"
  const isManager = profile.role === "MANAGER"
  const isOffice = profile.department === "OFFICE"
  const isCommonrail = profile.department === "COMMONRAIL"
  const isManagerOrOfficer = profile.role === "MANAGER" || profile.role === "OFFICER"

  const menuItems = [
    {
      href: "/app/jobs",
      label: "Jobs",
      icon: Briefcase,
      visible: true,
    },
    {
      href: "/app/office/intake",
      label: "Job Intake",
      icon: ClipboardPenLine,
      visible: isAdmin || isOffice,
    },
    {
      href: "/app/office/customers",
      label: "Customers",
      icon: Building,
      visible: isAdmin || isManager,
    },
    {
      href: "/app/admin/users",
      label: "Users",
      icon: Users,
      visible: isAdmin || isManager,
    },
    {
        href: "/app/commonrail/kiosk-office",
        label: "Kiosk Office",
        icon: QrCode,
        visible: isAdmin || (isCommonrail && isManagerOrOfficer),
    },
    {
        href: "/app/commonrail/kiosk-front",
        label: "Kiosk Front",
        icon: QrCode,
        visible: isAdmin || (isCommonrail && isManagerOrOfficer),
    },
  ]

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <nav className="flex flex-col gap-4 px-4 py-6">
        <Logo />
        <div className="flex-1">
          <ul className="space-y-1">
            {menuItems.map(
              (item) =>
                item.visible && (
                  <li key={item.href}>
                    <Button
                      asChild
                      variant={pathname.startsWith(item.href) ? "secondary" : "ghost"}
                      className="w-full justify-start"
                    >
                      <Link href={item.href}>
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  </li>
                )
            )}
          </ul>
        </div>
      </nav>
      <div className="mt-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
            <Avatar>
                <AvatarImage src={profile.photoURL} />
                <AvatarFallback>{getInitials(profile.displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col text-sm">
                <span className="font-semibold">{profile.displayName}</span>
                <span className="text-muted-foreground">{profile.email}</span>
            </div>
        </div>
        <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/app/me">
                <Settings className="mr-2 h-4 w-4" />
                Profile Settings
            </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  )
}
