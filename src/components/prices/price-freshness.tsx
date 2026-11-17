import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TZ = "America/Argentina/Buenos_Aires";

export function formatUpdateTime(iso: string) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const date = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return { time, date };
}

/** "Precios actualizados cada 15 minutos. Última actualización: 23:39 hs (16/11/2026)" + source attribution. */
export function PriceFreshness({
  updatedAt,
  refreshMinutes,
  className,
  compact,
}: {
  updatedAt: string;
  refreshMinutes: number;
  className?: string;
  compact?: boolean;
}) {
  const { time, date } = formatUpdateTime(updatedAt);
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border bg-secondary/60 px-3 py-2 text-sm text-secondary-foreground", className)} role="note">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong>Precios actualizados cada {refreshMinutes} minutos.</strong> Última actualización:{" "}
        <time dateTime={updatedAt} className="font-semibold tabular">
          {time} hs ({date})
        </time>
        .
        {compact ? null : (
          <>
            {" "}
            Pizarra Rosario: datos de{" "}
            <a href="https://granos.ar" target="_blank" rel="noopener" className="underline underline-offset-2">
              granos.ar
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}
