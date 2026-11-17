import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { SwapForm } from "@/components/crm/swap-form";
import { requireCrm } from "@/lib/auth";
import { registerSwapDelivery } from "@/lib/crm/actions";
import { listParties } from "@/lib/crm/queries";
import { getPriceBoard } from "@/lib/prices";
import { formatNumber } from "@/lib/format";
import { CROPS, isCrop, type Crop } from "@/lib/units";

export const metadata = { title: "Canjes de granos" };

export default async function SwapsPage() {
  const ctx = await requireCrm();
  const [parties, board, { data }] = await Promise.all([
    listParties(ctx, "customer"),
    getPriceBoard(),
    ctx.supabase.from("grain_swaps").select("*, parties(name)").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
  ]);
  const referencePrices: Partial<Record<Crop, { usd: number; label: string }>> = {};
  for (const q of board.quotes) {
    if (q.market === "rosario" && q.usdPerTon != null) referencePrices[q.crop] = { usd: q.usdPerTon, label: `Pizarra Rosario ${q.asOf}` };
  }
  const swaps = (data ?? []) as { id: string; crop: string; tons: number; delivered_tons: number; price_usd_t: number; status: string; parties: { name: string } | null }[];

  return (
    <>
      <PageHeader title="Canje de granos" description="Insumos pagados con granos: registrá el compromiso y las entregas." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nuevo canje</CardTitle>
          </CardHeader>
          <CardContent>
            <SwapForm parties={parties.map((p) => ({ id: p.id, name: p.name }))} referencePrices={referencePrices} />
          </CardContent>
        </Card>
        <div className="space-y-3">
          {swaps.length === 0 ? <EmptyState title="Sin canjes" /> : null}
          {swaps.map((s) => {
            const pending = Number(s.tons) - Number(s.delivered_tons);
            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{s.parties?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(Number(s.tons), 3)} t de {isCrop(s.crop) ? CROPS[s.crop].name : s.crop} a USD {formatNumber(Number(s.price_usd_t), 2)}/t = USD{" "}
                        {formatNumber(Number(s.tons) * Number(s.price_usd_t), 2)}
                      </p>
                    </div>
                    <Badge variant={s.status === "cumplido" ? "success" : "accent"}>{s.status}</Badge>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Number(s.delivered_tons)} aria-valuemax={Number(s.tons)}>
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (Number(s.delivered_tons) / Number(s.tons)) * 100)}%` }} />
                  </div>
                  <p className="text-sm">
                    Entregado {formatNumber(Number(s.delivered_tons), 3)} t · pendiente {formatNumber(pending, 3)} t
                  </p>
                  {pending > 0 ? (
                    <form action={registerSwapDelivery} className="flex gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Input name="tons" type="number" step="any" inputMode="decimal" placeholder="Toneladas entregadas" aria-label="Toneladas entregadas" />
                      <Button variant="secondary">Registrar</Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
