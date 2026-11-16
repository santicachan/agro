export type FieldKind = "number" | "select";

export interface CalcField {
  name: string;
  label: string;
  kind?: FieldKind;
  unit?: string;
  defaultValue: number | string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  options?: { value: string; label: string }[];
  /** Group fields visually (e.g. "Ingresos", "Costos"). */
  group?: string;
}

export type CalcInput = Record<string, number | string>;

export interface CalcResultItem {
  label: string;
  value: number;
  unit?: string;
  /** Decimal places when rendering. */
  digits?: number;
  highlight?: boolean;
  /** Mark negative values as bad / positive as good. */
  tone?: "signed" | "neutral";
}

export interface CalcResult {
  items: CalcResultItem[];
  notes?: string[];
}

export interface CalculatorDef {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  /** Long-form SEO copy rendered below the calculator. */
  seoIntro: string;
  keywords: string[];
  category: "economia" | "siembra" | "cosecha" | "nutricion" | "aplicacion" | "conversion";
  fields: CalcField[];
  compute: (input: CalcInput) => CalcResult;
  faq?: { q: string; a: string }[];
}

export function num(input: CalcInput, key: string): number {
  const v = input[key];
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function str(input: CalcInput, key: string): string {
  return String(input[key] ?? "");
}
