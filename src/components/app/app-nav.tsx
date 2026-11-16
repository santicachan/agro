"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, FileText, House, Repeat, Store, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const APP_NAV = [
  { href: "/app", label: "Inicio", icon: House },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/comprobantes", label: "Comprobantes", icon: FileText },
  { href: "/app/cheques", label: "Cheques", icon: Banknote },
  { href: "/app/proveedores", label: "Proveedores", icon: Truck },
  { href: "/app/canjes", label: "Canjes", icon: Repeat },
  { href: "/app/publicaciones", label: "Marketplace", icon: Store },
];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Aplicación">
      {APP_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={cn(
            "flex h-12 items-center gap-3 rounded-lg px-3 font-medium",
            isActive(pathname, item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <item.icon className="size-5" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Thumb-reachable bottom bar on phones: the 4 most used sections. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Accesos rápidos">
      {APP_NAV.slice(0, 4).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", isActive(pathname, item.href) ? "text-primary" : "text-muted-foreground")}
        >
          <item.icon className="size-6" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
