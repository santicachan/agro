import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { POSTS, getPost } from "@/content/blog";
import { formatDate } from "@/lib/format";
import { absoluteUrl, site } from "@/lib/site";
import { breadcrumbLd, buildMetadata, jsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) return {};
  return buildMetadata({ title: post.title, description: post.description, path: `/blog/${post.slug}`, keywords: post.keywords, type: "article" });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd([
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
            author: { "@type": "Organization", name: site.name },
            publisher: { "@type": "Organization", name: site.name },
          },
          breadcrumbLd([
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ])}
      />
      <p className="text-sm text-muted-foreground">{formatDate(`${post.date}T12:00:00`)}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{post.title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{post.description}</p>
      <div className="mt-8 space-y-5 text-[17px] leading-relaxed">
        {post.body.map((b, i) => {
          if ("h2" in b) return <h2 key={i} className="pt-2 text-2xl font-bold">{b.h2}</h2>;
          if ("p" in b) return <p key={i}>{b.p}</p>;
          if ("ul" in b)
            return (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {b.ul.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            );
          if ("sources" in b)
            return (
              <aside key={i} className="rounded-xl border bg-muted/40 p-4 text-sm">
                <h2 className="font-semibold">Fuentes</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {b.sources.map((src) => (
                    <li key={src.href + src.label}>
                      <a href={src.href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                        {src.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </aside>
            );
          return (
            <Button key={i} asChild size="lg">
              <Link href={b.cta.href}>{b.cta.label}</Link>
            </Button>
          );
        })}
      </div>
    </article>
  );
}
