"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg, getUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/billing/plans";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { LISTINGS_BUCKET } from "@/lib/supabase/env";
import { requiresVerification, slugify } from "./categories";

export interface FormState {
  error?: string;
  ok?: boolean;
}

const inquirySchema = z.object({
  listingId: z.uuid(),
  name: z.string().trim().min(2, "Tu nombre"),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.email("Email inválido"), z.literal("")]).optional(),
  message: z.string().trim().min(5, "Escribí tu consulta").max(2000),
  website: z.string().max(0).optional(), // honeypot
});

export async function sendInquiry(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = inquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { website, ...data } = parsed.data;
  if (website) return { ok: true };
  if (!data.phone && !data.email) return { error: "Dejá un teléfono o email para que te contacten" };
  const sb = createPublicClient();
  if (!sb) return { error: "No disponible" };
  const { error } = await sb.from("listing_inquiries").insert({ listing_id: data.listingId, name: data.name, phone: data.phone, email: data.email || null, message: data.message });
  return error ? { error: "No pudimos enviar la consulta" } : { ok: true };
}

/** Records a purchase intent; commission is computed in the DB from the seller's plan. */
export async function placeOrder(listingId: string, formData: FormData) {
  const user = await getUser();
  if (!user) redirect(`/ingresar?next=/marketplace`);
  const quantity = Math.max(1, Number(formData.get("quantity")) || 1);
  const supabase = await createClient();
  const { data: listing } = await supabase.from("listings").select("id, org_id, price, currency, slug").eq("id", listingId).eq("status", "active").single();
  if (!listing || listing.price == null) redirect("/marketplace");
  const { error } = await supabase.from("marketplace_orders").insert({
    listing_id: listing.id,
    seller_org_id: listing.org_id,
    buyer_user_id: user.id,
    quantity,
    amount: Number(listing.price) * quantity,
    currency: listing.currency,
    commission_pct: 0, // overwritten by trigger
    commission_amount: 0,
  });
  redirect(`/marketplace/item/${listing.slug}?${error ? `error=${encodeURIComponent(error.message)}` : "pedido=1"}`);
}

const listingSchema = z.object({
  category_slug: z.string().min(1, "Elegí una categoría"),
  title: z.string().trim().min(5, "Título demasiado corto").max(120),
  description: z.string().trim().max(5000).default(""),
  price: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  currency: z.enum(["USD", "ARS", "BRL"]),
  unit: z.string().trim().max(20).optional(),
  condition: z.enum(["nuevo", "usado", "reacondicionado"]).optional(),
  brand: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  year: z.union([z.coerce.number().int().min(1950).max(2100), z.literal("")]).optional(),
  province: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
});

const MAX_IMAGES = 6;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export async function createListing(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireOrg();
  const parsed = listingSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "images")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  if (requiresVerification(d.category_slug)) {
    const { data: v } = await supabase.from("seller_verifications").select("status").eq("org_id", org.id).maybeSingle();
    if (v?.status !== "verified") return { error: "Para publicar agroquímicos necesitás ser vendedor verificado. Solicitá la verificación desde Marketplace." };
  }

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_IMAGES);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) return { error: "Las fotos superan 4 MB en total. Subí menos o más livianas." };
  const images: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) return { error: "Solo se permiten imágenes" };
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `${org.id}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(LISTINGS_BUCKET).upload(path, file, { contentType: file.type });
    if (error) return { error: `No pudimos subir una foto: ${error.message}` };
    images.push(path);
  }

  const { error } = await supabase.from("listings").insert({
    org_id: org.id,
    category_slug: d.category_slug,
    title: d.title,
    slug: `${slugify(d.title)}-${randomUUID().slice(0, 6)}`,
    description: d.description,
    price: d.price === "" ? null : d.price,
    currency: d.currency,
    unit: d.unit || null,
    condition: d.condition ?? null,
    brand: d.brand || null,
    model: d.model || null,
    year: d.year === "" ? null : d.year,
    province: d.province || null,
    city: d.city || null,
    region: org.region,
    images,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/marketplace");
  redirect("/app/publicaciones?publicado=1");
}

export async function setListingStatus(formData: FormData) {
  const { supabase, org } = await requireOrg();
  const status = String(formData.get("status"));
  if (!["active", "paused", "sold"].includes(status)) return;
  await supabase.from("listings").update({ status }).eq("id", String(formData.get("id"))).eq("org_id", org.id);
  revalidatePath("/app/publicaciones");
  revalidatePath("/marketplace");
}

export async function requestVerification(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireOrg();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const license = String(formData.get("agrochem_license") ?? "").trim();
  if (taxId.replace(/\D/g, "").length < 8) return { error: "Ingresá un CUIT válido" };
  const { error } = await supabase.from("seller_verifications").insert({ org_id: org.id, tax_id: taxId, agrochem_license: license || null });
  if (error) return { error: error.message.includes("duplicate") ? "Ya tenés una solicitud en curso." : error.message };
  revalidatePath("/app/publicaciones");
  return { ok: true };
}
