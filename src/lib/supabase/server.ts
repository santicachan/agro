import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/** Per-request client bound to the user's session (RLS applies). */
export async function createClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Service-role client for trusted server jobs (cron, webhooks). Bypasses RLS. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createJsClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

/** Anonymous client without cookies, for public cached reads. */
export function createPublicClient() {
  if (!isSupabaseConfigured()) return null;
  return createJsClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}
