import type { Metadata } from "next";
import { absoluteUrl, site } from "./site";

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: site.name, locale: site.locale, type },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Render a JSON-LD block. Content is our own data, serialized safely. */
export function jsonLd(data: Record<string, unknown> | Record<string, unknown>[]) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function faqLd(faq: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
