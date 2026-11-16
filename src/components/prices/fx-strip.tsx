import { Alert } from "@/components/ui/misc";
import { formatNumber } from "@/lib/format";
import type { PriceBoard } from "@/lib/prices/types";

export function FxStrip({ fx }: { fx: PriceBoard["fx"] }) {
  if (!fx.length) return null;
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {fx.map((f) => (
        <div key={f.pair} className="rounded-lg border bg-card px-3 py-2">
          <span className="text-muted-foreground">{f.label}: </span>
          <span className="font-semibold tabular">
            {formatNumber(f.buy, 2)} / {formatNumber(f.sell, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SourceErrors({ errors }: { errors: PriceBoard["errors"] }) {
  if (!errors.length) return null;
  return (
    <Alert tone="warning">
      Algunas fuentes no respondieron en este momento: {errors.map((e) => e.source).join(", ")}. Mostramos el resto de los precios
      disponibles.
    </Alert>
  );
}
