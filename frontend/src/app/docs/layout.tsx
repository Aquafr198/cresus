import { MarketingShell } from "@/components/landing/MarketingShell";

/**
 * Layout applied to /docs and all sub-routes (/docs/features, /docs/security, etc.).
 * Wraps them in the public MarketingShell (nav + footer + dark theme) so docs
 * render consistently with the rest of the marketing surface — previously they
 * were orphaned (no nav, no footer) after we opened /docs to public via
 * MARKETING_PREFIXES in AuthGate.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
