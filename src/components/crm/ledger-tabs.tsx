import Link from "next/link";
import { LEDGERS, type LedgerView, type ViewCurrency } from "@/lib/crm/ledger";
import { cn } from "@/lib/utils";

type Params = Record<string, string | undefined>;

function href(base: string, params: Params) {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/** Blanco / Gestión / Marmolada tabs. `views` hides Marmolada where it doesn't apply. */
export function LedgerTabs({
  base,
  current,
  params = {},
  views = ["blanco", "gestion", "marmolada"],
}: {
  base: string;
  current: LedgerView;
  params?: Params;
  views?: LedgerView[];
}) {
  return (
    <nav className="flex gap-1 rounded-xl border bg-muted/60 p-1" aria-label="Cuenta corriente">
      {views.map((v) => (
        <Link
          key={v}
          href={href(base, { ...params, cuenta: v })}
          aria-current={current === v ? "page" : undefined}
          title={LEDGERS[v].description}
          className={cn(
            "flex h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold sm:flex-none sm:px-5",
            current === v ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LEDGERS[v].label}
        </Link>
      ))}
    </nav>
  );
}

/** Pesos / dólares switch for cuentas corrientes. */
export function CurrencyToggle({ base, current, params = {}, baseCurrency }: { base: string; current: ViewCurrency; params?: Params; baseCurrency: string }) {
  const options: { v: ViewCurrency; label: string }[] = [
    { v: "ARS", label: baseCurrency === "ARS" ? "Pesos" : baseCurrency },
    { v: "USD", label: "Dólares" },
  ];
  return (
    <nav className="flex gap-1 rounded-full border bg-card p-1" aria-label="Moneda">
      {options.map((o) => (
        <Link
          key={o.v}
          href={href(base, { ...params, moneda: o.v })}
          aria-current={current === o.v ? "page" : undefined}
          className={cn("h-9 rounded-full px-4 text-sm font-medium leading-9", current === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function LedgerBadge({ ledger }: { ledger: string | null | undefined }) {
  if (ledger !== "gestion") return null;
  return <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-semibold text-muted-foreground">Gestión · interno</span>;
}
