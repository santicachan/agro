/**
 * Regional configuration. Everything country-specific (currency, tax id,
 * e-invoicing authority, local units) lives here so expanding
 * Argentina → Brasil → rest of LatAm is a config change, not a rewrite.
 */
export type RegionCode = "AR" | "BR" | "UY" | "PY";

export interface Region {
  code: RegionCode;
  name: string;
  locale: string;
  currency: "ARS" | "BRL" | "UYU" | "PYG";
  /** Label of the national tax id (CUIT, CNPJ, RUT, RUC). */
  taxIdLabel: string;
  /** Electronic invoicing authority / web service. */
  eInvoicing: { authority: string; provider: string; enabled: boolean };
  /** Preferred trade unit for grain in this market. */
  grainUnit: "t" | "qq" | "saca";
  vatRates: number[];
}

export const REGIONS: Record<RegionCode, Region> = {
  AR: {
    code: "AR",
    name: "Argentina",
    locale: "es-AR",
    currency: "ARS",
    taxIdLabel: "CUIT",
    eInvoicing: { authority: "ARCA (ex AFIP)", provider: "arca-wsfe", enabled: true },
    grainUnit: "t",
    vatRates: [0, 10.5, 21, 27],
  },
  BR: {
    code: "BR",
    name: "Brasil",
    locale: "pt-BR",
    currency: "BRL",
    taxIdLabel: "CNPJ/CPF",
    eInvoicing: { authority: "SEFAZ (NF-e)", provider: "sefaz-nfe", enabled: false },
    grainUnit: "saca",
    vatRates: [0, 12, 17, 18],
  },
  UY: {
    code: "UY",
    name: "Uruguay",
    locale: "es-UY",
    currency: "UYU",
    taxIdLabel: "RUT",
    eInvoicing: { authority: "DGI (CFE)", provider: "dgi-cfe", enabled: false },
    grainUnit: "t",
    vatRates: [0, 10, 22],
  },
  PY: {
    code: "PY",
    name: "Paraguay",
    locale: "es-PY",
    currency: "PYG",
    taxIdLabel: "RUC",
    eInvoicing: { authority: "SET (SIFEN)", provider: "set-sifen", enabled: false },
    grainUnit: "t",
    vatRates: [0, 5, 10],
  },
};

export const DEFAULT_REGION: RegionCode = "AR";

export function getRegion(code: string | null | undefined): Region {
  return REGIONS[(code?.toUpperCase() as RegionCode) ?? DEFAULT_REGION] ?? REGIONS[DEFAULT_REGION];
}
