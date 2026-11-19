import Link from "next/link";
import { LEDGERS, type Ledger } from "@/lib/crm/ledger";
import { cn } from "@/lib/utils";

/** Chooses the ledger a new document goes to: Blanco (formal) or Gestión (Factura X, internal). */
export function LedgerSwitch({ type, ledger, partyId }: { type: string; ledger: Ledger; partyId?: string }) {
  const href = (l: Ledger) => `/app/comprobantes/nuevo?tipo=${type}${partyId ? `&party=${partyId}` : ""}${l === "gestion" ? "&cuenta=gestion" : ""}`;
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="mb-2 text-sm font-medium">Cuenta</p>
      <nav className="grid grid-cols-2 gap-2" aria-label="Cuenta del comprobante">
        {(["blanco", "gestion"] as const).map((l) => (
          <Link
            key={l}
            href={href(l)}
            aria-current={ledger === l ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col justify-center rounded-lg border px-3 py-2 text-sm",
              ledger === l ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            <span className="font-semibold">{LEDGERS[l].label}</span>
            <span className="text-xs text-muted-foreground">{l === "blanco" ? "Formal · va a los libros" : "Interna · Factura X"}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
