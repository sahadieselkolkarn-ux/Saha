"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Briefcase,
  ClipboardPenLine,
  Building,
  QrCode,
  Camera,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"

export function AppSidebar() {
  const pathname = usePathname()

  const menuItems = [
    {
      href: "/app/jobs",
      label: "Jobs",
      icon: Briefcase,
    },
    {
        href: "/app/office/intake",
        label: "Job Intake",
        icon: ClipboardPenLine,
    },
    {
        href: "/app/office/customers",
        label: "Customers",
        icon: Building,
    },
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

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <nav className="flex flex-1 flex-col gap-4 px-4 py-6">
        <Logo />
        <ul className="flex-1 space-y-1">
          {menuItems.map(
            (item) => (
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
      </nav>
    </aside>
  )
}
