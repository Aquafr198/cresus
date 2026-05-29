import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import {
  ARTICLES,
  type ArticleBlock,
  getArticleBySlug,
  getRelatedArticles,
} from "@/lib/knowledge-base";

export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: "Article not found · Offivex" };
  return {
    title: `${article.title} · Offivex Knowledge Base`,
    description: article.desc,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const related = getRelatedArticles(slug, 3);

  return (
    <MarketingShell>
      <article className="px-6 pt-10 pb-16">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumbs */}
          <nav className="text-xs text-offivex-text-muted mb-6 flex flex-wrap items-center gap-1.5">
            <Link href="/knowledge-base" className="hover:text-white transition-colors">
              Knowledge base
            </Link>
            <span>›</span>
            <Link
              href={`/knowledge-base#${article.categorySlug}`}
              className="hover:text-white transition-colors"
            >
              {article.category}
            </Link>
            <span>›</span>
            <span className="text-offivex-text-secondary">{article.title}</span>
          </nav>

          {/* Header */}
          <header className="mb-10">
            <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">
              {article.category}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] mb-4">
              {article.title}
            </h1>
            <p className="text-offivex-text-secondary text-base md:text-lg leading-relaxed mb-5">
              {article.desc}
            </p>
            <div className="flex items-center gap-4 text-xs text-offivex-text-muted">
              <span>{article.readMinutes} min read</span>
              <span aria-hidden>•</span>
              <span>Updated {formatDate(article.updatedAt)}</span>
            </div>
          </header>

          {/* Body */}
          <div className="space-y-5">
            {article.blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>

          {/* Footer CTA */}
          <div className="mt-14 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="text-sm text-offivex-text-secondary">
              Was this article helpful? DM us on{" "}
              <a
                href="https://t.me/offivex"
                className="text-offivex-purple-light hover:text-white underline"
              >
                Telegram
              </a>{" "}
              or email{" "}
              <a
                href="mailto:hello@offivex.io"
                className="text-offivex-purple-light hover:text-white underline"
              >
                hello@offivex.io
              </a>
              .
            </div>
            <Link
              href="/knowledge-base"
              className="text-sm text-offivex-purple-light hover:text-white transition-colors whitespace-nowrap"
            >
              ← Back to knowledge base
            </Link>
          </div>
        </div>
      </article>

      {/* Related */}
      {related.length > 0 && (
        <section className="px-6 py-14 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-2">
              Related
            </div>
            <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight mb-6">
              More in {article.category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((a) => (
                <Link
                  key={a.slug}
                  href={`/knowledge-base/${a.slug}`}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-offivex-purple/30 hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="font-medium text-white mb-1 text-sm group-hover:text-offivex-purple-light transition-colors">
                    {a.title}
                  </div>
                  <div className="text-xs text-offivex-text-secondary leading-relaxed">
                    {a.desc}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </MarketingShell>
  );
}

function BlockRenderer({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-offivex-text-secondary leading-relaxed text-[15px]">
          {block.text}
        </p>
      );
    case "h2":
      return (
        <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white mt-8 mb-2">
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 className="font-display text-lg font-semibold text-white mt-6 mb-1">
          {block.text}
        </h3>
      );
    case "ul":
      return (
        <ul className="space-y-2 pl-1">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="text-offivex-text-secondary text-[15px] leading-relaxed flex gap-3"
            >
              <span className="text-offivex-purple-light/70 mt-1.5 shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="space-y-2 pl-1 counter-reset-[step]">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="text-offivex-text-secondary text-[15px] leading-relaxed flex gap-3"
            >
              <span className="text-offivex-purple-light/70 font-semibold mt-0 shrink-0 w-5 text-right">
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "callout": {
      const tone = block.tone;
      const styles =
        tone === "warn"
          ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-200"
          : tone === "tip"
            ? "border-offivex-green/30 bg-offivex-green/[0.06] text-offivex-green-light"
            : "border-offivex-purple/30 bg-offivex-purple/[0.06] text-offivex-purple-light";
      const label = tone === "warn" ? "Warning" : tone === "tip" ? "Tip" : "Note";
      return (
        <div className={`rounded-xl border px-4 py-3 ${styles}`}>
          <div className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-1 opacity-80">
            {label}
          </div>
          <div className="text-[14px] leading-relaxed">{block.text}</div>
        </div>
      );
    }
    case "code":
      return (
        <pre className="rounded-xl border border-white/[0.06] bg-black/40 p-4 text-xs text-offivex-text-secondary overflow-x-auto font-mono">
          <code>{block.text}</code>
        </pre>
      );
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
