"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { publicNav } from "@/lib/site";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-12 items-center justify-center rounded-lg hover:bg-muted"
      >
        {open ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>
      {open ? (
        <nav className="absolute inset-x-0 top-16 border-b bg-background p-4 shadow-lg" aria-label="Móvil">
          <ul className="flex flex-col gap-1">
            {[...publicNav, { href: "/app", label: "Mi campo" }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-lg font-medium hover:bg-muted">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
