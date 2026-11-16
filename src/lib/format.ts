export function formatMoney(value: number, currency = "ARS", locale = "es-AR", digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number, digits = 2, locale = "es-AR"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number, digits = 1, locale = "es-AR"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

export function formatDate(value: string | Date, locale = "es-AR"): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Parse an Argentine-formatted number like "1.534,50" or "$545.000,00". */
export function parseArNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}
