/** Mirrors supabase/seed.sql so category pages can be statically generated. */
export interface Category {
  slug: string;
  name: string;
  parent: string | null;
  description: string;
}

export const CATEGORIES: Category[] = [
  { slug: "agroquimicos", name: "Agroquímicos", parent: null, description: "Herbicidas, insecticidas y fungicidas de vendedores verificados." },
  { slug: "agroquimicos-herbicidas", name: "Herbicidas", parent: "agroquimicos", description: "Glifosato, atrazina, 2,4-D y más herbicidas para barbecho y cultivo." },
  { slug: "agroquimicos-insecticidas", name: "Insecticidas", parent: "agroquimicos", description: "Insecticidas para control de orugas, chinches y trips." },
  { slug: "agroquimicos-fungicidas", name: "Fungicidas", parent: "agroquimicos", description: "Fungicidas foliares y curasemillas." },
  { slug: "insumos", name: "Insumos", parent: null, description: "Semillas, fertilizantes y almacenaje para tu campaña." },
  { slug: "insumos-semillas", name: "Semillas", parent: "insumos", description: "Semillas de soja, maíz, trigo y girasol." },
  { slug: "insumos-fertilizantes", name: "Fertilizantes", parent: "insumos", description: "Urea, MAP, SPS y mezclas físicas." },
  { slug: "insumos-silobolsas", name: "Silobolsas y almacenaje", parent: "insumos", description: "Silobolsas, embolsadoras y extractoras." },
  { slug: "maquinarias", name: "Maquinarias", parent: null, description: "Tractores, cosechadoras, sembradoras y pulverizadoras nuevas y usadas." },
  { slug: "maquinarias-tractores", name: "Tractores", parent: "maquinarias", description: "Tractores nuevos y usados de todas las potencias." },
  { slug: "maquinarias-cosechadoras", name: "Cosechadoras", parent: "maquinarias", description: "Cosechadoras y cabezales." },
  { slug: "maquinarias-sembradoras", name: "Sembradoras", parent: "maquinarias", description: "Sembradoras de grano grueso y fino." },
  { slug: "maquinarias-pulverizadoras", name: "Pulverizadoras", parent: "maquinarias", description: "Pulverizadoras autopropulsadas y de arrastre." },
  { slug: "servicios", name: "Servicios", parent: null, description: "Contratistas de siembra, cosecha, pulverización y fletes." },
];

export const getCategory = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
export const childrenOf = (slug: string) => CATEGORIES.filter((c) => c.parent === slug);
export const requiresVerification = (slug: string) => slug.startsWith("agroquimicos");

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
