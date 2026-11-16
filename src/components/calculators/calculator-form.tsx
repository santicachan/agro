"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { getCalculator } from "@/lib/calculators/registry";
import type { CalcInput } from "@/lib/calculators/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Live calculator: results update on every keystroke, no submit button needed. */
export function CalculatorForm({ slug }: { slug: string }) {
  const calc = getCalculator(slug)!;
  const [input, setInput] = useState<CalcInput>(() => Object.fromEntries(calc.fields.map((f) => [f.name, f.defaultValue])));
  const result = useMemo(() => calc.compute(input), [calc, input]);

  const groups = calc.fields.reduce<Record<string, typeof calc.fields>>((acc, f) => {
    (acc[f.group ?? ""] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardContent className="space-y-6 pt-5">
          {Object.entries(groups).map(([group, fields]) => (
            <fieldset key={group} className="space-y-4">
              {group ? <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</legend> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => {
                  const id = `f-${f.name}`;
                  return (
                    <Field key={f.name} label={f.unit ? `${f.label} (${f.unit})` : f.label} htmlFor={id} hint={f.help}>
                      {f.kind === "select" ? (
                        <Select id={id} value={String(input[f.name])} onChange={(e) => setInput((s) => ({ ...s, [f.name]: e.target.value }))}>
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          id={id}
                          type="number"
                          inputMode="decimal"
                          min={f.min}
                          max={f.max}
                          step={f.step ?? "any"}
                          value={String(input[f.name])}
                          onChange={(e) => setInput((s) => ({ ...s, [f.name]: e.target.value }))}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-20" aria-live="polite">
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.items.map((it) => (
            <div key={it.label} className={cn("flex items-baseline justify-between gap-3 border-b pb-2 last:border-0", it.highlight && "rounded-lg border-0 bg-secondary p-3")}>
              <span className={cn("text-sm", it.highlight ? "font-semibold" : "text-muted-foreground")}>{it.label}</span>
              <span
                className={cn(
                  "text-right font-semibold tabular",
                  it.highlight && "text-2xl",
                  it.tone === "signed" && it.value < 0 && "text-destructive",
                  it.tone === "signed" && it.value > 0 && "text-success",
                )}
              >
                {formatNumber(it.value, it.digits ?? 2)}
                {it.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{it.unit}</span> : null}
              </span>
            </div>
          ))}
          {result.notes?.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
