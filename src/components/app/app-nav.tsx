"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, BookOpen, FileText, House, Lock, Repeat, Settings, Sparkles, Store, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const APP_NAV = [
  { href: "/app", label: "Inicio", icon: House },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/comprobantes", label: "Comprobantes", icon: FileText },
  { href: "/app/cheques", label: "Cheques", icon: Banknote },
  { href: "/app/proveedores", label: "Proveedores", icon: Truck },
  { href: "/app/canjes", label: "Canjes", icon: Repeat },
  { href: "/app/libros", label: "Libros contables", icon: BookOpen },
  { href: "/app/publicaciones", label: "Marketplace", icon: Store },
  { href: "/app/configuracion", label: "Configuración", icon: Settings },
];

/** Free plans: CRM is locked (shows the upsell); marketplace and plan stay available. */
export const FREE_NAV = [
  { href: "/app/mejorar", label: "CRM", icon: Lock },
  { href: "/app/publicaciones", label: "Marketplace", icon: Store },
  { href: "/app/plan", label: "Mi plan", icon: Sparkles },
];

const navFor = (crm: boolean) => (crm ? APP_NAV : FREE_NAV);

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SideNav({ crm }: { crm: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Aplicación">
      {navFor(crm).map((item) => (
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
export function BottomNav({ crm }: { crm: boolean }) {
  const pathname = usePathname();
  const items = crm ? APP_NAV.slice(0, 4) : FREE_NAV;
  return (
    <nav
      className={cn("fixed inset-x-0 bottom-0 z-40 grid border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden", items.length === 4 ? "grid-cols-4" : "grid-cols-3")}
      aria-label="Accesos rápidos"
    >
      {items.map((item) => (
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
