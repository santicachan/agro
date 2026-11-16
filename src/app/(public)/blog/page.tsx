import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { POSTS } from "@/content/blog";
import { formatDate } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Blog agro: precios, márgenes y manejo",
  description: "Guías prácticas sobre precios de granos, márgenes, comercialización y manejo de cultivos para productores y asesores.",
  path: "/blog",
});

export default function BlogIndex() {
  return (
    <>
      <PageHeader title="Blog" description="Guías prácticas para tomar mejores decisiones en el campo." />
      <div className="grid gap-4 md:grid-cols-2">
        {POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <p className="text-xs text-muted-foreground">{formatDate(`${p.date}T12:00:00`)}</p>
                <CardTitle className="text-xl">{p.title}</CardTitle>
                <CardDescription className="text-base">{p.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
