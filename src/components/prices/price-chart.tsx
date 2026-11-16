"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PricePoint } from "@/lib/prices/types";

const fmtDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

/** Single-series history chart (USD/t). Title names the series, so no legend. */
export function PriceChart({ data, label }: { data: PricePoint[]; label: string }) {
  if (data.length < 2) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay historial suficiente para {label}.</p>;
  }
  return (
    <div className="h-64 w-full" role="img" aria-label={`Evolución de ${label} en USD por tonelada`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
            labelFormatter={(d) => fmtDate(String(d))}
            formatter={(v) => [`USD ${Number(v).toFixed(2)}/t`, label]}
          />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
