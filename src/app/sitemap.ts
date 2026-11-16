import type { MetadataRoute } from "next";
import { POSTS } from "@/content/blog";
import { CALCULATORS } from "@/lib/calculators/registry";
import { CATEGORIES } from "@/lib/marketplace/categories";
import { createPublicClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

const PRICED = ["soja", "maiz", "trigo", "girasol", "sorgo"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/precios"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    ...PRICED.map((c) => ({ url: absoluteUrl(`/precios/${c}`), lastModified: now, changeFrequency: "hourly" as const, priority: 0.9 })),
    { url: absoluteUrl("/calculadoras"), changeFrequency: "monthly", priority: 0.8 },
    ...CALCULATORS.map((c) => ({ url: absoluteUrl(`/calculadoras/${c.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absoluteUrl("/marketplace"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...CATEGORIES.map((c) => ({ url: absoluteUrl(`/marketplace/${c.slug}`), changeFrequency: "daily" as const, priority: 0.6 })),
    { url: absoluteUrl("/blog"), changeFrequency: "weekly", priority: 0.6 },
    ...POSTS.map((p) => ({ url: absoluteUrl(`/blog/${p.slug}`), lastModified: new Date(p.date), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: absoluteUrl("/planes"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/partners"), changeFrequency: "monthly", priority: 0.4 },
  ];

  const sb = createPublicClient();
  if (sb) {
    const { data } = await sb.from("listings").select("slug, created_at").eq("status", "active").order("created_at", { ascending: false }).limit(5000);
    for (const l of data ?? []) entries.push({ url: absoluteUrl(`/marketplace/item/${l.slug}`), lastModified: new Date(l.created_at), changeFrequency: "weekly", priority: 0.5 });
  }
  return entries;
}
