"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";

export interface DocBreadcrumb {
  href: string;
  label: string;
}

export interface DocNavLink {
  href: string;
  label: string;
}

interface DocLayoutProps {
  /** Top-of-page label, e.g. "Feature reference" */
  eyebrow: string;
  /** H1 — the page title */
  title: string;
  /** One-paragraph elevator pitch under the title */
  intro: string;
  /** Breadcrumb trail. The current page is the page itself — do NOT include it. */
  breadcrumbs?: DocBreadcrumb[];
  /** Previous page in the recommended reading order. */
  prev?: DocNavLink | null;
  /** Next page in the recommended reading order. */
  next?: DocNavLink | null;
  /** Page body. */
  children: ReactNode;
  /** Optional sidebar TOC. Pairs of {id, label} — the page must render matching `id=`. */
  toc?: { id: string; label: string }[];
}

export function DocLayout({
  eyebrow,
  title,
  intro,
  breadcrumbs = [{ href: "/docs", label: "Documentation" }],
  prev = null,
  next = null,
  children,
  toc,
}: DocLayoutProps) {
  return (
    <div className="max-w-6xl mx-auto px-6 pt-12 pb-24">
      {/* Breadcrumbs */}
      <nav className="mb-4 flex items-center flex-wrap gap-x-1 gap-y-1 text-sm text-gray-500">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Docs
        </Link>
        {breadcrumbs.slice(1).map((crumb) => (
          <span key={crumb.href} className="inline-flex items-center gap-1">
            <ChevronRightIcon className="w-3 h-3 text-gray-600" />
            <Link
              href={crumb.href}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              {crumb.label}
            </Link>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <ChevronRightIcon className="w-3 h-3 text-gray-600" />
          <span className="text-gray-200">{title}</span>
        </span>
      </nav>

      {/* Header */}
      <header className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.22em] text-offivex-purple-light mb-3">
          {eyebrow}
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] mb-4">
          {title}
        </h1>
        <p className="text-offivex-text-secondary text-base md:text-lg max-w-3xl">
          {intro}
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-10">
        {/* Main content */}
        <main className="min-w-0 doc-prose">{children}</main>

        {/* Sticky TOC */}
        {toc && toc.length > 0 ? (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted mb-3">
                On this page
              </div>
              <ul className="space-y-2 text-sm border-l border-white/[0.08] pl-4">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-gray-400 hover:text-offivex-purple-light transition-colors block"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Prev / Next */}
      {(prev || next) && (
        <nav className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/[0.06] pt-8">
          {prev ? (
            <Link
              href={prev.href}
              className="group block p-4 rounded-xl border border-white/[0.08] hover:border-offivex-purple/40 bg-white/[0.02] hover:bg-offivex-purple/[0.04] transition-colors"
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted mb-1">
                ← Previous
              </div>
              <div className="text-sm font-semibold text-gray-200 group-hover:text-offivex-purple-light transition-colors">
                {prev.label}
              </div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={next.href}
              className="group block p-4 rounded-xl border border-white/[0.08] hover:border-offivex-purple/40 bg-white/[0.02] hover:bg-offivex-purple/[0.04] transition-colors text-right"
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted mb-1">
                Next →
              </div>
              <div className="text-sm font-semibold text-gray-200 group-hover:text-offivex-purple-light transition-colors">
                {next.label}
              </div>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * Section heading helper used inside docs pages. Renders an H2 with an `id`
 * that the DocLayout TOC anchors target.
 */
export function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-2xl font-semibold text-gray-100 mb-4 border-b border-white/[0.06] pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Sub-section heading helper — H3, smaller, no border.
 */
export function DocSubsection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="mb-6 scroll-mt-24">
      <h3 className="text-lg font-semibold text-offivex-purple-light mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Inline `<code>` style used throughout docs.
 */
export function DocCode({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[0.85em] bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-offivex-purple-light">
      {children}
    </code>
  );
}

/**
 * Pre-formatted code block. Pass plain text as children.
 */
export function DocCodeBlock({
  children,
  lang,
}: {
  children: ReactNode;
  lang?: string;
}) {
  return (
    <div className="my-3 rounded-lg border border-white/[0.08] bg-black/40 overflow-hidden">
      {lang ? (
        <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-offivex-text-muted border-b border-white/[0.06] bg-white/[0.02]">
          {lang}
        </div>
      ) : null}
      <pre className="font-mono text-xs text-gray-200 p-3 overflow-x-auto leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

/**
 * Key-value reference table — config options, error fixes, etc.
 */
export function DocTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] border-b border-white/[0.06]">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-offivex-text-muted font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-white/[0.04] last:border-0 align-top"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Numbered step list. Each step is `{ title, body }`.
 */
export function DocSteps({
  steps,
}: {
  steps: { title: string; body: ReactNode }[];
}) {
  return (
    <ol className="space-y-4 my-4">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-4">
          <span className="shrink-0 w-7 h-7 rounded-full bg-offivex-purple/15 border border-offivex-purple/30 text-offivex-purple-light text-sm font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-100 mb-1">{step.title}</div>
            <div className="text-sm text-gray-400 leading-relaxed">
              {step.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
