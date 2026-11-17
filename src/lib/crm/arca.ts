/**
 * ARCA (ex AFIP) electronic invoicing — WSFEv1.
 *
 * This module builds the `FECAESolicitar` request from our document model (pure,
 * tested) and defines the provider interface. The SOAP transport + WSAA token
 * (certificate signing) is intentionally pluggable: it needs the taxpayer's
 * certificate and private key, which must be stored in a secret manager
 * (Supabase Vault), never in the database row.
 */
import { isValidCuit, type DocType, type Letter } from "./documents";

/** CbteTipo codes (tabla de comprobantes ARCA). */
const CBTE_TIPO: Partial<Record<DocType, Partial<Record<Letter, number>>>> = {
  factura_venta: { A: 1, B: 6, C: 11, M: 51, E: 19 },
  nota_debito_venta: { A: 2, B: 7, C: 12, M: 52, E: 20 },
  nota_credito_venta: { A: 3, B: 8, C: 13, M: 53, E: 21 },
};

/** IVA Id codes. */
const IVA_ID: Record<string, number> = { "0": 3, "10.5": 4, "21": 5, "27": 6, "5": 8, "2.5": 9 };

/** Currency codes (MonId). */
const MON_ID: Record<string, string> = { ARS: "PES", USD: "DOL", EUR: "060", BRL: "012" };

export interface ArcaDocument {
  type: DocType;
  letter: Letter;
  pointOfSale: number;
  number: number;
  issueDate: string; // YYYY-MM-DD
  receiverTaxId: string | null; // CUIT, digits only or with dashes
  currency: string;
  fxRate: number;
  net: number;
  vat: number;
  otherTaxes: number;
  total: number;
  vatByRate: { rate: number; base: number; amount: number }[];
  /** Concepto: 1 productos, 2 servicios, 3 ambos. */
  concept?: 1 | 2 | 3;
  associated?: { type: DocType; letter: Letter; pointOfSale: number; number: number; cuit: string; date: string }[];
}

export function cbteTipo(type: DocType, letter: Letter): number {
  const code = CBTE_TIPO[type]?.[letter];
  if (!code) throw new Error(`Comprobante no fiscal o letra inválida: ${type} ${letter}`);
  return code;
}

export function buildFECAERequest(doc: ArcaDocument) {
  const digits = (doc.receiverTaxId ?? "").replace(/\D/g, "");
  const yyyymmdd = doc.issueDate.replace(/-/g, "");
  const det: Record<string, unknown> = {
    Concepto: doc.concept ?? 1,
    DocTipo: digits.length === 11 ? 80 : 99, // 80 CUIT, 99 consumidor final sin identificar
    DocNro: digits.length === 11 ? Number(digits) : 0,
    CbteDesde: doc.number,
    CbteHasta: doc.number,
    CbteFch: yyyymmdd,
    ImpTotal: doc.total,
    ImpTotConc: 0,
    ImpNeto: doc.letter === "C" ? doc.total - doc.otherTaxes : doc.net,
    ImpOpEx: 0,
    ImpIVA: doc.letter === "C" ? 0 : doc.vat,
    ImpTrib: doc.otherTaxes,
    MonId: MON_ID[doc.currency] ?? "PES",
    MonCotiz: doc.currency === "ARS" ? 1 : doc.fxRate,
  };
  if (doc.letter !== "C") {
    det.Iva = {
      AlicIva: doc.vatByRate.map((v) => {
        const id = IVA_ID[String(v.rate)];
        if (!id) throw new Error(`Alícuota de IVA no soportada: ${v.rate}%`);
        return { Id: id, BaseImp: v.base, Importe: v.amount };
      }),
    };
  }
  if (doc.associated?.length) {
    det.CbtesAsoc = {
      CbteAsoc: doc.associated.map((a) => ({
        Tipo: cbteTipo(a.type, a.letter),
        PtoVta: a.pointOfSale,
        Nro: a.number,
        Cuit: a.cuit.replace(/\D/g, ""),
        CbteFch: a.date.replace(/-/g, ""),
      })),
    };
  }
  return {
    FeCAEReq: {
      FeCabReq: { CantReg: 1, PtoVta: doc.pointOfSale, CbteTipo: cbteTipo(doc.type, doc.letter) },
      FeDetReq: { FECAEDetRequest: [det] },
    },
  };
}

export interface EInvoicingResult {
  cae: string;
  caeDue: string;
  raw: unknown;
}

export interface EInvoicingProvider {
  readonly id: string;
  authorize(doc: ArcaDocument, issuerCuit: string): Promise<EInvoicingResult>;
}

/**
 * Placeholder provider: returns a clear error until WSAA credentials are configured.
 * Swap with a real implementation (own SOAP client or a provider such as
 * AfipSDK / TusFacturas) behind this same interface.
 */
export class UnconfiguredArcaProvider implements EInvoicingProvider {
  readonly id = "arca-wsfe";
  async authorize(): Promise<EInvoicingResult> {
    throw new Error("ARCA no está configurado: cargá el certificado digital y el punto de venta en Configuración → Facturación electrónica.");
  }
}

export function getEInvoicingProvider(): EInvoicingProvider {
  return new UnconfiguredArcaProvider();
}

// ─────────────────────────────────────────────── Pre-flight validation
export interface ArcaCheckInput {
  type: DocType;
  letter: Letter | null;
  pointOfSale: number;
  issueDate: string;
  issuerCuit: string | null;
  receiverCuit: string | null;
  receiverCondition: string | null;
  vatRates: number[];
  total: number;
  configuredPointOfSale: number | null;
  today?: string;
}

/** Everything ARCA would reject, checked before calling the web service. Messages are for non-accountants. */
export function arcaPreflight(i: ArcaCheckInput): string[] {
  const errors: string[] = [];
  if (!CBTE_TIPO[i.type]) errors.push("Este tipo de comprobante no se autoriza en ARCA (solo facturas y notas de crédito/débito de venta).");
  if (!i.letter) errors.push("El comprobante no tiene letra (A, B o C).");
  if (!isValidCuit(i.issuerCuit)) errors.push("Falta el CUIT de tu empresa o no es válido. Cargalo en Configuración.");
  if (!i.configuredPointOfSale) errors.push("Falta configurar el punto de venta de factura electrónica en Configuración.");
  else if (i.pointOfSale !== i.configuredPointOfSale) errors.push(`El comprobante usa el punto de venta ${i.pointOfSale}, pero el habilitado en ARCA es ${i.configuredPointOfSale}.`);
  if (i.letter === "A" && !isValidCuit(i.receiverCuit)) errors.push("Para una factura A el cliente necesita un CUIT válido.");
  if (i.letter !== "C") for (const r of i.vatRates) if (IVA_ID[String(r)] === undefined) errors.push(`La alícuota de IVA ${r}% no existe en ARCA.`);
  if (!(i.total > 0)) errors.push("El total tiene que ser mayor a cero.");
  const today = new Date(`${i.today ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const date = new Date(`${i.issueDate}T12:00:00Z`);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days < -5 || days > 5) errors.push("ARCA solo acepta comprobantes de productos con fecha hasta 5 días antes o después de hoy.");
  return errors;
}

export const ARCA_ENVIRONMENTS = { homologacion: "Homologación (pruebas)", produccion: "Producción" } as const;
export type ArcaEnvironment = keyof typeof ARCA_ENVIRONMENTS;

export function isArcaConfigured() {
  return Boolean(process.env.ARCA_CERT && process.env.ARCA_KEY);
}
