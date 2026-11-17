import type { Crop } from "@/lib/units";

export type Market = "rosario" | "cme" | "brasil";

export interface PriceQuote {
  /** Stable key: `${market}:${crop}` */
  key: string;
  market: Market;
  crop: Crop;
  label: string;
  /** Price in the market's native currency and unit. */
  price: number;
  currency: "ARS" | "USD" | "BRL";
  unit: "t" | "bu" | "saca";
  /** Normalised USD per metric tonne for comparisons. */
  usdPerTon: number | null;
  /** Daily change in percent, when the source provides it. */
  changePct: number | null;
  direction: "up" | "down" | "flat" | null;
  /** Business date of the quote (YYYY-MM-DD). */
  asOf: string;
  /** True when the source flags the price as an estimate (e.g. BCR "S/C (E)"). */
  estimated: boolean;
  /** True when the live source failed and this comes from our last stored snapshot. */
  stale?: boolean;
  source: string;
  sourceUrl: string;
}

export interface FxRate {
  pair: "USD/ARS" | "USD/BRL";
  label: string;
  buy: number;
  sell: number;
  asOf: string;
  source: string;
}

export interface PricePoint {
  date: string;
  value: number;
}

export interface PriceBoard {
  quotes: PriceQuote[];
  fx: FxRate[];
  /** USD/t series (CBOT, snapshots). */
  history: Record<string, PricePoint[]>;
  /** ARS/t series for Rosario (granos.ar). */
  historyArs: Record<string, PricePoint[]>;
  fetchedAt: string;
  /** When the Rosario prices were last refreshed at the source (granos.ar), else fetchedAt. */
  updatedAt: string;
  refreshMinutes: number;
  /** Sources that failed during this fetch (shown to the user, never hidden). */
  errors: { source: string; message: string }[];
}
