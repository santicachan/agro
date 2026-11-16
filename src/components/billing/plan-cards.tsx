import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { PLANS, type Plan } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export function PlanCards({ currentPlanId, action }: { currentPlanId?: string; action: (plan: Plan) => React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((p) => (
        <Card key={p.id} className={cn("flex flex-col", p.highlight && "border-2 border-primary")}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{p.name}</CardTitle>
              {p.highlight ? <Badge variant="default">Más elegido</Badge> : null}
              {currentPlanId === p.id ? <Badge variant="success">Tu plan</Badge> : null}
            </div>
            <CardDescription>
              <span className="text-3xl font-bold text-foreground">USD {p.priceUsdMonth}</span>
              {p.priceUsdMonth ? " /mes" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>{action(p)}</CardFooter>
        </Card>
      ))}
    </div>
  );
}
