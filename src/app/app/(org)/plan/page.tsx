import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PlanCards } from "@/components/billing/plan-cards";
import { requireOrg } from "@/lib/auth";
import { startCheckout } from "@/lib/billing/actions";
import { PLANS } from "@/lib/billing/plans";

export const metadata = { title: "Mi plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ error, ok }, ctx] = await Promise.all([searchParams, requireOrg()]);
  const currentIndex = PLANS.findIndex((p) => p.id === ctx.plan.id);
  return (
    <>
      <PageHeader title="Mi plan" description={`Estás en el plan ${ctx.plan.name}.`} />
      {error ? (
        <Alert tone="error" className="mb-4">
          {error === "permisos" ? "Solo el dueño o un administrador puede cambiar el plan." : error}
        </Alert>
      ) : null}
      {ok ? (
        <Alert className="mb-4">¡Gracias! Cuando Mercado Pago confirme el pago, tu plan se actualiza automáticamente.</Alert>
      ) : null}
      <PlanCards
        currentPlanId={ctx.plan.id}
        action={(p) => {
          const idx = PLANS.findIndex((x) => x.id === p.id);
          if (idx <= currentIndex) return null;
          return (
            <form action={startCheckout.bind(null, p.id)} className="w-full">
              <Button className="w-full">{p.id === "enterprise" ? "Contactar" : `Pasar a ${p.name}`}</Button>
            </form>
          );
        }}
      />
    </>
  );
}
