import Link from "next/link";
import type { Metadata } from "next";
import { LogOut, Sprout } from "lucide-react";
import { BottomNav, SideNav } from "@/components/app/app-nav";
import { Badge } from "@/components/ui/misc";
import { requireOrg } from "@/lib/auth";
import { site } from "@/lib/site";
import { signOut } from "@/app/(public)/ingresar/actions";

// Always per-request: depends on the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const { org, plan, user } = await requireOrg();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r bg-card p-4 lg:flex lg:flex-col lg:gap-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="size-5" aria-hidden />
          </span>
          {site.name}
        </Link>
        <SideNav crm={plan.crm} />
        <div className="mt-auto space-y-2 text-sm">
          <p className="font-semibold">{org.name}</p>
          <p className="truncate text-muted-foreground">{user.email}</p>
          <Link href="/app/plan">
            <Badge variant="accent">Plan {plan.name}</Badge>
          </Link>
          <form action={signOut}>
            <button className="mt-2 flex h-10 items-center gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" /> Salir
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 lg:hidden">
          <span className="font-bold">{org.name}</span>
          <Link href="/app/plan">
            <Badge variant="accent">Plan {plan.name}</Badge>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 lg:pb-8">{children}</main>
      </div>
      <BottomNav crm={plan.crm} />
    </div>
  );
}
