"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Badge, Table, Td, Th } from "@/components/ui/misc";
import { formatDate, formatNumber } from "@/lib/format";
import type { FxRate, PriceQuote } from "@/lib/prices/types";
import { CROPS, convertPrice, type MassUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

type Currency = "USD" | "ARS" | "BRL";
const UNITS: { value: MassUnit; label: string }[] = [
  { value: "t", label: "Tonelada" },
  { value: "qq", label: "Quintal" },
  { value: "saca", label: "Saca 60 kg" },
  { value: "bu", label: "Bushel" },
];

const NATIVE_UNIT: Record<PriceQuote["unit"], string> = { t: "t", bu: "bu", saca: "saca" };

export function PriceTable({ quotes, fx, showCrop = true }: { quotes: PriceQuote[]; fx: FxRate[]; showCrop?: boolean }) {
  const [unit, setUnit] = useState<MassUnit>("t");
  const [currency, setCurrency] = useState<Currency>("USD");
  const rate = (c: Currency) => (c === "USD" ? 1 : fx.find((f) => f.pair === `USD/${c}`)?.buy ?? null);
  const currencyRate = rate(currency);
  const availableCurrencies = (["USD", "ARS", "BRL"] as Currency[]).filter((c) => rate(c) != null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Unidad y moneda">
        <Segmented value={unit} onChange={setUnit} options={UNITS} />
        <Segmented value={currency} onChange={setCurrency} options={availableCurrencies.map((c) => ({ value: c, label: c }))} />
      </div>
      <Table>
        <thead>
          <tr>
            {showCrop ? <Th>Grano</Th> : null}
            <Th>Mercado</Th>
            <Th className="text-right">Precio original</Th>
            <Th className="text-right">
              {currency}/{unit}
            </Th>
            <Th className="text-right">Var.</Th>
            <Th>Fecha</Th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const converted = q.usdPerTon != null && currencyRate != null ? convertPrice(q.usdPerTon * currencyRate, "t", unit, q.crop) : null;
            return (
              <tr key={q.key}>
                {showCrop ? <Td className="font-semibold">{CROPS[q.crop].name}</Td> : null}
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{q.label}</span>
                    {q.estimated ? <Badge variant="accent" title="Sin cotización: precio estimado por la Cámara">Estimado</Badge> : null}
                    {q.stale ? <Badge variant="destructive" title="La fuente no respondió; mostramos el último dato guardado">Último guardado</Badge> : null}
                  </div>
                  <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-muted-foreground hover:underline">
                    {q.source}
                  </a>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {q.currency} {formatNumber(q.price, q.unit === "bu" ? 4 : 2)}/{NATIVE_UNIT[q.unit]}
                </Td>
                <Td className="text-right text-base font-semibold whitespace-nowrap">{converted == null ? "—" : formatNumber(converted, 2)}</Td>
                <Td className="text-right">
                  <Change pct={q.changePct} direction={q.direction} />
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDate(`${q.asOf}T12:00:00`)}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

export function Change({ pct, direction }: { pct: number | null; direction: PriceQuote["direction"] }) {
  const dir = direction ?? (pct == null ? null : pct > 0 ? "up" : pct < 0 ? "down" : "flat");
  if (!dir) return <span className="text-muted-foreground">—</span>;
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const label = dir === "up" ? "Sube" : dir === "down" ? "Baja" : "Sin cambio";
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", dir === "up" && "text-success", dir === "down" && "text-destructive")}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
      {pct != null ? `${pct > 0 ? "+" : ""}${formatNumber(pct, 2)}%` : null}
    </span>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-md px-3 text-sm font-medium", value === o.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
