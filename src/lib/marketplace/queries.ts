import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { childrenOf } from "./categories";

export interface Listing {
  id: string;
  org_id: string;
  category_slug: string;
  title: string;
  slug: string;
  description: string;
  price: number | null;
  currency: string;
  unit: string | null;
  condition: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  province: string | null;
  city: string | null;
  images: string[];
  status: string;
  featured_until: string | null;
  created_at: string;
  organizations?: { name: string; seller_verifications: { status: string } | null } | null;
}

const SELECT = "*, organizations(name, seller_verifications(status))";

export async function searchListings({ category, q, limit = 48 }: { category?: string; q?: string; limit?: number }) {
  const sb = createPublicClient();
  if (!sb) return [];
  let query = sb
    .from("listings")
    .select(SELECT)
    .eq("status", "active")
    .order("featured_until", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) query = query.in("category_slug", [category, ...childrenOf(category).map((c) => c.slug)]);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  return (data ?? []) as Listing[];
}

export async function getListing(slug: string) {
  const sb = createPublicClient();
  if (!sb) return null;
  const { data } = await sb.from("listings").select(SELECT).eq("slug", slug).eq("status", "active").maybeSingle();
  return data as Listing | null;
}

export function isFeatured(l: Pick<Listing, "featured_until">) {
  return Boolean(l.featured_until && new Date(l.featured_until) > new Date());
}

export function isVerified(l: Listing) {
  return l.organizations?.seller_verifications?.status === "verified";
}

export function imageUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listings/${path}`;
}
