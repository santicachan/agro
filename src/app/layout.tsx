import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { site } from "@/lib/site";
import { jsonLd } from "@/lib/seo";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
  description:
    "Precios de granos hoy (Rosario, Chicago, Brasil), calculadoras agro gratuitas, gestión comercial y facturación para el campo, y marketplace de insumos y maquinaria.",
  applicationName: site.name,
  openGraph: { siteName: site.name, locale: site.locale, type: "website" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f6b2f" },
    { media: "(prefers-color-scheme: dark)", color: "#11140f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh">
        {/* White-label: partners override the primary color per deployment. */}
        {site.primaryColor && /^#[0-9a-f]{3,8}$/i.test(site.primaryColor) ? (
          <style>{`:root{--primary:${site.primaryColor};--ring:${site.primaryColor}}`}</style>
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: site.name,
            url: site.url,
            email: site.supportEmail,
          })}
        />
        {children}
      </body>
    </html>
  );
}
