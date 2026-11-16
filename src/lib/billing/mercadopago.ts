import "server-only";

/**
 * Mercado Pago subscriptions (preapproval). Prices are defined in USD and charged
 * in local currency at checkout using the day's exchange rate.
 * Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions
 */
const API = "https://api.mercadopago.com";

export function isMercadoPagoConfigured() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${body?.message ?? "error"}`);
  return body as T;
}

export async function createSubscription(opts: { reason: string; amount: number; currency: string; payerEmail: string; backUrl: string; externalReference: string }) {
  return mp<{ id: string; init_point: string }>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: opts.reason,
      external_reference: opts.externalReference,
      payer_email: opts.payerEmail,
      back_url: opts.backUrl,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Math.round(opts.amount), currency_id: opts.currency },
      status: "pending",
    }),
  });
}

export async function getSubscription(id: string) {
  return mp<{ id: string; status: string; external_reference: string; next_payment_date?: string }>(`/preapproval/${encodeURIComponent(id)}`);
}

export async function createPayment(opts: { title: string; amount: number; currency: string; externalReference: string; backUrl: string; notificationUrl: string }) {
  return mp<{ id: string; init_point: string }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ title: opts.title, quantity: 1, unit_price: Math.round(opts.amount), currency_id: opts.currency }],
      external_reference: opts.externalReference,
      back_urls: { success: opts.backUrl, failure: opts.backUrl, pending: opts.backUrl },
      auto_return: "approved",
      notification_url: opts.notificationUrl,
    }),
  });
}

export async function getPayment(id: string) {
  return mp<{ id: number; status: string; external_reference: string }>(`/v1/payments/${encodeURIComponent(id)}`);
}
