import Link from "next/link";
import { notFound } from "next/navigation";
import { CalculatorForm } from "@/components/calculators/calculator-form";
import { PageHeader } from "@/components/ui/misc";
import { CALCULATORS, getCalculator } from "@/lib/calculators/registry";
import { absoluteUrl } from "@/lib/site";
import { buildMetadata, breadcrumbLd, faqLd, jsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return CALCULATORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const calc = getCalculator((await params).slug);
  if (!calc) return {};
  return buildMetadata({ title: calc.title, description: calc.description, path: `/calculadoras/${calc.slug}`, keywords: calc.keywords });
}

export default async function CalculatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const calc = getCalculator((await params).slug);
  if (!calc) notFound();
  const related = CALCULATORS.filter((c) => c.slug !== calc.slug).slice(0, 4);
  const ld: Record<string, unknown>[] = [
    breadcrumbLd([
      { name: "Inicio", path: "/" },
      { name: "Calculadoras", path: "/calculadoras" },
      { name: calc.shortTitle, path: `/calculadoras/${calc.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: calc.title,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: absoluteUrl(`/calculadoras/${calc.slug}`),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ];
  if (calc.faq) ld.push(faqLd(calc.faq));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <PageHeader title={calc.title} description={calc.description} />
      <CalculatorForm slug={calc.slug} />
      <section className="mt-10 max-w-3xl space-y-4">
        <h2 className="text-xl font-bold">Cómo se calcula</h2>
        <p className="text-muted-foreground">{calc.seoIntro}</p>
        {calc.faq?.map((f) => (
          <div key={f.q}>
            <h3 className="font-semibold">{f.q}</h3>
            <p className="text-muted-foreground">{f.a}</p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Resultados orientativos. Validá las decisiones agronómicas con tu asesor.</p>
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">Otras calculadoras</h2>
        <ul className="flex flex-wrap gap-2">
          {related.map((c) => (
            <li key={c.slug}>
              <Link href={`/calculadoras/${c.slug}`} className="inline-flex h-11 items-center rounded-lg border bg-card px-4 font-medium hover:bg-muted">
                {c.shortTitle}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
