import { Badge } from "@/components/ui/misc";
import { CONCEPT_LABEL, paymentStatus, type DocType } from "@/lib/crm/documents";

const PAY: Record<"pagado" | "parcial" | "pendiente", { label: string; variant: "success" | "accent" | "outline" }> = {
  pagado: { label: "Pagado", variant: "success" },
  parcial: { label: "Pago parcial", variant: "accent" },
  pendiente: { label: "Pendiente de pago", variant: "outline" },
};

/** Status chips for a document: payment state, ARCA state and concept. Text, never color alone. */
export function DocBadges({
  type,
  total,
  pending,
  status,
  concept,
  arcaStatus,
  fiscal,
}: {
  type: DocType;
  total: number;
  pending?: number | null;
  status: string;
  concept?: string | null;
  arcaStatus?: string | null;
  fiscal?: boolean;
}) {
  const pay = paymentStatus(type, total, pending);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {concept && concept in CONCEPT_LABEL ? <Badge variant="secondary">{CONCEPT_LABEL[concept as keyof typeof CONCEPT_LABEL]}</Badge> : null}
      {pay ? <Badge variant={PAY[pay].variant}>{PAY[pay].label}</Badge> : null}
      {status === "authorized" ? (
        <Badge variant="success">CAE</Badge>
      ) : fiscal ? (
        <Badge variant="outline">{arcaStatus === "ready" ? "Listo para ARCA" : "Sin CAE"}</Badge>
      ) : null}
    </span>
  );
}
