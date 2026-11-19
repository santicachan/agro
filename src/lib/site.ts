/**
 * Brand configuration. White-label partners get their own deployment (own domain,
 * same codebase) and override these values through environment variables, which
 * keeps public pages fully static/ISR for SEO.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "CAMPAGROX",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Todo tu negocio del agro en un solo lugar",
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  primaryColor: process.env.NEXT_PUBLIC_BRAND_COLOR ?? null,
  partnerSlug: process.env.NEXT_PUBLIC_PARTNER_SLUG ?? null,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hola@campagrox.com",
  locale: "es_AR",
};

export const publicNav = [
  { href: "/precios", label: "Precios" },
  { href: "/calculadoras", label: "Calculadoras" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/blog", label: "Blog" },
  { href: "/planes", label: "Planes" },
];

export function absoluteUrl(path = "/") {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}
