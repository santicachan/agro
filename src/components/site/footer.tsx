import Link from "next/link";
import { CALCULATORS } from "@/lib/calculators/registry";
import { CROPS, type Crop } from "@/lib/units";
import { site } from "@/lib/site";

export function SiteFooter() {
  const crops: Crop[] = ["soja", "maiz", "trigo", "girasol"];
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-lg font-bold">{site.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">{site.tagline}</p>
        </div>
        <FooterCol title="Precios hoy" links={crops.map((c) => ({ href: `/precios/${c}`, label: `Precio ${CROPS[c].name.toLowerCase()} hoy` }))} />
        <FooterCol title="Calculadoras" links={CALCULATORS.slice(0, 6).map((c) => ({ href: `/calculadoras/${c.slug}`, label: c.shortTitle }))} />
        <FooterCol
          title="Empresa"
          links={[
            { href: "/planes", label: "Planes y precios" },
            { href: "/marketplace", label: "Marketplace" },
            { href: "/blog", label: "Blog" },
            { href: "/partners", label: "Partners / marca blanca" },
          ]}
        />
      </div>
      <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {site.name}. Los precios son informativos y provienen de fuentes públicas; verificá con tu corredor antes de operar.
      </p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-2 font-semibold">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
