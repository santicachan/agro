import Link from "next/link";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicNav, site } from "@/lib/site";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="size-5" aria-hidden />
          </span>
          {site.name}
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {publicNav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/app">Mi campo</Link>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
