/**
 * Cuentas corrientes Blanco / Gestión / Marmolada and their ARS ⇄ USD views
 * (pure, framework-agnostic so it is unit-tested).
 *
 * - Blanco: formal operations. Libros contables and ARCA only see this ledger.
 * - Gestión: informal operations. Its invoices are "Facturas X" (letter X, internal).
 * - Marmolada: read-only reconciliation of the parties that have movements in
 *   both ledgers. Balances are shown side by side and never mixed.
 */
import { ledgerSign, type DocType } from "./documents";

export type Ledger = "blanco" | "gestion";
export type LedgerView = Ledger | "marmolada";
export type ViewCurrency = "ARS" | "USD";

export const LEDGERS: Record<LedgerView, { label: string; description: string }> = {
  blanco: { label: "Blanco", description: "Operaciones formales. De acá salen los libros contables para la contadora." },
  gestion: { label: "Gestión", description: "Operaciones internas con Facturas X. No van a ARCA ni a los libros." },
  marmolada: { label: "Marmolada", description: "Conciliación de clientes y proveedores con cuenta en Blanco y en Gestión. Solo lectura." },
};

export const isLedger = (v: unknown): v is Ledger => v === "blanco" || v === "gestion";
export const parseLedger = (v: unknown, fallback: Ledger = "blanco"): Ledger => (isLedger(v) ? v : fallback);
export const parseLedgerView = (v: unknown): LedgerView => (v === "marmolada" ? "marmolada" : parseLedger(v));
export const parseViewCurrency = (v: unknown): ViewCurrency => (v === "USD" ? "USD" : "ARS");

/** Gestión invoices and notes carry the internal letter X. */
export function ledgerLetter(ledger: Ledger, fiscalLetter: string | null): string | null {
  if (ledger === "gestion") return fiscalLetter === null ? null : "X";
  return fiscalLetter;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface FxPoint {
  date: string; // YYYY-MM-DD
  rate: number; // base currency per USD
}

/**
 * Rate on a date: the latest published rate on or before that day; if the date is
 * older than every stored rate, the oldest one; with no history, `fallback`.
 */
export function rateOn(history: FxPoint[], date: string, fallback: number | null): number | null {
  let best: FxPoint | null = null;
  for (const p of history) {
    if (p.rate > 0 && p.date <= date && (!best || p.date > best.date)) best = p;
  }
  if (best) return best.rate;
  const oldest = history.filter((p) => p.rate > 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return oldest?.rate ?? fallback;
}

export interface MovementLike {
  type: DocType;
  issue_date: string;
  currency: string;
  fx_rate: number;
  total: number;
  /** Signed amount in the base currency (account_movements.amount). */
  amount: number;
  usd_rate?: number | null;
}

/**
 * Signed amount of a movement in the chosen view currency.
 * - ARS view: the base-currency amount (USD documents valued at their own rate).
 * - USD view: USD documents at face value; peso documents divided by the rate of
 *   their issue day (stored on the document, or the published rate of that day).
 * Returns null when there is no rate to convert.
 */
export function movementAmountIn(m: MovementLike, view: ViewCurrency, baseCurrency: string, rateFor: (date: string) => number | null): number | null {
  if (view === baseCurrency || view === "ARS") return m.amount;
  if (m.currency === view) return round2(ledgerSign(m.type) * m.total);
  const rate = Number(m.usd_rate) > 0 ? Number(m.usd_rate) : m.currency === "USD" && m.fx_rate > 0 ? m.fx_rate : rateFor(m.issue_date);
  if (!rate || rate <= 0) return null;
  return round2(m.amount / rate);
}

export interface PartyLedgerRow {
  party_id: string;
  ledger: Ledger;
  amount: number;
}

export interface ReconciliationRow {
  partyId: string;
  blanco: number;
  gestion: number;
  /** Sum of both balances, shown only as the reconciled position (movements are never mixed). */
  combined: number;
  /** Blanco minus Gestión: how far apart both accounts are. */
  difference: number;
}

/** Balance per party and ledger from signed movements. */
export function balancesByLedger(rows: PartyLedgerRow[]) {
  const map = new Map<string, { blanco: number; gestion: number; hasBlanco: boolean; hasGestion: boolean }>();
  for (const r of rows) {
    const acc = map.get(r.party_id) ?? { blanco: 0, gestion: 0, hasBlanco: false, hasGestion: false };
    if (r.ledger === "gestion") {
      acc.gestion = round2(acc.gestion + r.amount);
      acc.hasGestion = true;
    } else {
      acc.blanco = round2(acc.blanco + r.amount);
      acc.hasBlanco = true;
    }
    map.set(r.party_id, acc);
  }
  return map;
}

/** Marmolada: only parties with an account (movements) in both Blanco and Gestión. */
export function marmolada(rows: PartyLedgerRow[]): ReconciliationRow[] {
  const out: ReconciliationRow[] = [];
  for (const [partyId, b] of balancesByLedger(rows)) {
    if (!b.hasBlanco || !b.hasGestion) continue;
    out.push({ partyId, blanco: b.blanco, gestion: b.gestion, combined: round2(b.blanco + b.gestion), difference: round2(b.blanco - b.gestion) });
  }
  return out;
}
