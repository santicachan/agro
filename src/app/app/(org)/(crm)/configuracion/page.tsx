import { Check, Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/crm/settings-form";
import { requireCrm } from "@/lib/auth";
import { isArcaConfigured } from "@/lib/crm/arca";
import { isValidCuit } from "@/lib/crm/documents";

export const metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { org } = await requireCrm();
  const cfg = (org.arca_config ?? {}) as { pointOfSale?: number; environment?: string };
  const certificate = isArcaConfigured();
  const checks = [
    { ok: isValidCuit(org.tax_id), label: "CUIT válido" },
    { ok: Boolean(org.tax_condition), label: "Condición frente al IVA" },
    { ok: Boolean(cfg.pointOfSale), label: "Punto de venta electrónico" },
    { ok: certificate, label: "Certificado digital de ARCA" },
  ];
  return (
    <>
      <PageHeader title="Configuración" description="Datos de tu empresa y factura electrónica." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm org={{ name: org.name, tax_id: org.tax_id, tax_condition: org.tax_condition, pointOfSale: cfg.pointOfSale ?? null, environment: cfg.environment ?? "homologacion" }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5" aria-hidden /> Factura electrónica ARCA
            </CardTitle>
            <CardDescription>
              {certificate ? "Conectado: los comprobantes se autorizan con CAE." : "El sistema ya valida y arma cada solicitud de CAE. Falta conectar el certificado."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-2">
                  <span>{c.label}</span>
                  {c.ok ? (
                    <Badge variant="success">
                      <Check className="size-3" aria-hidden /> Listo
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pendiente</Badge>
                  )}
                </li>
              ))}
            </ul>
            {!certificate ? (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="mb-2 font-semibold">Cómo conectar ARCA</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>En ARCA, con clave fiscal, generá un certificado en “Administración de certificados digitales”.</li>
                  <li>Autorizá el servicio “wsfe” (Facturación electrónica) para ese certificado.</li>
                  <li>Creá un punto de venta “Web Services” y cargalo acá.</li>
                  <li>Envianos el certificado: lo guardamos cifrado y se activa el botón “Autorizar en ARCA”.</li>
                </ol>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
