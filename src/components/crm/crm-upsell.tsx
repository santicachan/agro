import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Banknote, Check, FileText, Landmark, MessageCircle, Repeat, Sprout, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Users, title: "Clientes y cuenta corriente", text: "El saldo de cada cliente y proveedor al día, con todo su historial." },
  { icon: FileText, title: "Facturación de venta y compra", text: "Remitos, facturas y notas de crédito o débito en segundos." },
  { icon: Banknote, title: "Cheques y cobranzas", text: "Cartera de cheques y eCheqs, endosos, depósitos y recibos." },
  { icon: Repeat, title: "Canje / Trueque", text: "Insumos contra granos, con precio de pizarra y control de entregas." },
  { icon: ArrowLeftRight, title: "Diferencia de cambio", text: "Facturás en dólares y la nota de débito se arma sola." },
  { icon: Landmark, title: "Conectado a ARCA", text: "Preparado para factura electrónica con CAE." },
];

const HERMESYS_URL = "https://hermesys.vercel.app/";
const SALES_WHATSAPP = process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "5493412816910";
const contactHref = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(`Hola, quiero conocer el CRM de ${site.name} para mi empresa.`)}`;

function Ctas({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/app/plan">
          Ver planes <ArrowRight />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
        <a href={contactHref} target="_blank" rel="noopener noreferrer">
          <MessageCircle /> Contactar
        </a>
      </Button>
    </div>
  );
}

function FeatureTile({ feature, side }: { feature: (typeof FEATURES)[number]; side?: "left" | "right" }) {
  const Icon = feature.icon;
  return (
    <li
      className={cn(
        "relative flex gap-3 rounded-xl border bg-card p-4 shadow-sm",
        // Dashed connector toward the hub on wide screens.
        side === "left" && "lg:after:absolute lg:after:left-full lg:after:top-1/2 lg:after:w-8 lg:after:border-t-2 lg:after:border-dashed lg:after:border-primary/40",
        side === "right" && "lg:before:absolute lg:before:right-full lg:before:top-1/2 lg:before:w-8 lg:before:border-t-2 lg:before:border-dashed lg:before:border-primary/40",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-semibold leading-tight">{feature.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
      </div>
    </li>
  );
}

export function CrmUpsell() {
  const left = FEATURES.slice(0, 3);
  const right = FEATURES.slice(3);
  return (
    <div className="mx-auto max-w-4xl space-y-8 sm:space-y-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-primary px-5 py-8 text-primary-foreground sm:px-10 sm:py-12">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          <Sprout className="size-4" aria-hidden /> CRM {site.name}
        </p>
        <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">El sistema que estabas buscando, diseñado para vos.</h1>
        <p className="mt-4 max-w-2xl text-lg opacity-90 sm:text-xl">El mejor CRM del momento para el agro argentino. Simple, potente y conectado a ARCA.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="accent" className="w-full sm:w-auto">
            <Link href="/app/plan">
              Ver planes <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 sm:w-auto">
            <a href={contactHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Contactar
            </a>
          </Button>
        </div>
      </section>

      {/* Main pitch */}
      <section className="space-y-3">
        <p className="text-lg leading-relaxed sm:text-xl">
          Gestioná todo tu negocio en un solo lugar: clientes, facturas de venta y compra, remitos, cheques, canjes, trueques, diferencia de cambio y cuenta corriente.{" "}
          <strong>Todo integrado y listo para facturación electrónica con ARCA.</strong>
        </p>
      </section>

      {/* Diagram: everything connected to one hub */}
      <section aria-labelledby="todo-conectado">
        <h2 id="todo-conectado" className="mb-4 text-xl font-bold sm:text-2xl">
          Todo conectado, nada se escapa
        </h2>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-8">
          <div className="flex justify-center lg:order-2">
            <div className="flex size-36 flex-col items-center justify-center gap-1 rounded-full border-4 border-primary bg-secondary text-center shadow-md sm:size-44">
              <Sprout className="size-8 text-primary" aria-hidden />
              <p className="text-sm font-bold leading-tight">Tu negocio</p>
              <p className="text-xs text-muted-foreground">en un solo lugar</p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:order-1 lg:grid-cols-1">
            {left.map((f) => (
              <FeatureTile key={f.title} feature={f} side="left" />
            ))}
          </ul>
          <ul className="grid gap-3 sm:grid-cols-2 lg:order-3 lg:grid-cols-1">
            {right.map((f) => (
              <FeatureTile key={f.title} feature={f} side="right" />
            ))}
          </ul>
        </div>
      </section>

      {/* Special offer */}
      <section className="rounded-2xl border-2 border-accent bg-accent/40 p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Wrench className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent-foreground">Oferta especial</p>
            <h2 className="mt-1 text-2xl font-extrabold">Lo hacemos a medida.</h2>
            <p className="mt-2 text-lg">
              Modificaciones y adaptaciones <strong>gratis durante los primeros 3 meses</strong> para que el sistema se ajuste perfecto a tu forma de trabajar.
            </p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              {["Tus comprobantes, tus campos", "Tus reportes", "Sin costo extra por 3 meses"].map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <Check className="size-4 text-success" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center sm:p-10">
        <h2 className="text-2xl font-bold sm:text-3xl">Dejá las planillas. Empezá hoy.</h2>
        <p className="max-w-xl text-muted-foreground">Elegí el plan que mejor se adapte a tu negocio o escribinos y lo armamos juntos.</p>
        <Ctas className="w-full justify-center" />
        <p className="text-sm text-muted-foreground">
          Mientras tanto, seguí usando{" "}
          <Link href="/precios" className="font-medium text-primary hover:underline">
            precios
          </Link>
          ,{" "}
          <Link href="/calculadoras" className="font-medium text-primary hover:underline">
            calculadoras
          </Link>{" "}
          y el{" "}
          <Link href="/marketplace" className="font-medium text-primary hover:underline">
            marketplace
          </Link>{" "}
          gratis.
        </p>
      </section>

      {/* Powered by Hermesys */}
      <footer className="flex justify-center pb-4">
        <a
          href={HERMESYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-3 rounded-full border bg-card py-2 pl-2 pr-5 shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Powered by Hermesys (abre en una pestaña nueva)"
        >
          <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-black ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand mark */}
            <img src="/brand/hermesys-ankh.jpg" alt="" width={113} height={192} className="h-8 w-auto" />
          </span>
          <span className="text-sm">
            <span className="text-muted-foreground">Powered by</span> <span className="font-bold tracking-wide group-hover:text-primary">Hermesys</span>
          </span>
        </a>
      </footer>
    </div>
  );
}
