export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** The app runs in "public-only" mode (prices, calculators, blog) without Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Postgres schema holding AgroJC tables. "public" for a dedicated project; set to
 * "agrojc" when sharing a Supabase project with another app (see scripts/build-schema-sql.mjs).
 */
export const SUPABASE_SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public";
/** Storage bucket for marketplace photos. */
export const LISTINGS_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_LISTINGS_BUCKET || "listings";
