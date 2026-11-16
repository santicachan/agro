/**
 * ARCA (ex AFIP) electronic invoicing — WSFEv1.
 *
 * This module builds the `FECAESolicitar` request from our document model (pure,
 * tested) and defines the provider interface. The SOAP transport + WSAA token
 * (certificate signing) is intentionally pluggable: it needs the taxpayer's
 * certificate and private key, which must be stored in a secret manager
 * (Supabase Vault), never in the database row.
 */
import type { DocType, Letter } from "./documents";

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
