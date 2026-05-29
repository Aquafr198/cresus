import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";

export default function RefundPage() {
  return (
    <MarketingShell>
      <article className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <header className="mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Legal</div>
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-[0.98] mb-5">
            Refund Policy
          </h1>
          <p className="text-offivex-text-secondary text-sm">
            Last updated · 2026-05-20 · Operated from Dubai UAE
          </p>
        </header>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-12 text-sm text-offivex-text-secondary leading-relaxed">
          We stand behind the quality of Offivex. If the platform doesn&apos;t fit your launch flow,
          this page tells you exactly how to get your money back — with no friction and no questions
          beyond the few required by our payment processors.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          <RefundCard
            plan="Monthly"
            price="$1,000 / month"
            window="7 days"
            condition="Full refund if you have not launched any tokens or run any bot tasks within the first 7 days of the billing cycle."
          />
          <RefundCard
            plan="Yearly"
            price="$7,000 / year"
            window="30 days"
            condition="Full refund within 30 days of the initial purchase, regardless of usage. After day 30, no refunds; subscription remains active until expiry."
            highlight
          />
        </div>

        <Section title="1. How to request a refund">
          <p>Email <a href="mailto:billing@offivex.io" className="text-offivex-purple-light hover:text-white underline">billing@offivex.io</a> with subject &ldquo;Refund request&rdquo;. Include:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Your account email</li>
            <li>The plan (Monthly or Yearly)</li>
            <li>Original payment method (card / SOL / USDC / USDT)</li>
            <li>A one-line reason (optional, helps us improve)</li>
          </ul>
          <p className="mt-3">We reply within 1 business day and process the refund within 3-5 business days from approval.</p>
        </Section>

        <Section title="2. Crypto payments (SOL / USDC / USDT)">
          <p>Refunded in the same asset to the wallet you paid from. Reasons we may decline a crypto refund:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>The wallet you paid from no longer exists or is compromised — we can refund to a verified replacement wallet only after KYC of the requester.</li>
            <li>Sanctioned address or sanctioned jurisdiction.</li>
            <li>Refund value distortion &gt; 15% due to extreme crypto volatility — we offer USDC equivalent to the original USD amount instead.</li>
          </ul>
          <p className="mt-3">Network fees deducted at Solana / TRC20 standard rates (typically &lt; $1).</p>
        </Section>

        <Section title="3. Pro-rata cancellations (mid-cycle)">
          <p>You can downgrade Yearly → Monthly anytime. The downgrade activates at the end of your current Yearly cycle — no pro-rata cash refund.</p>
          <p className="mt-3">You can cancel Monthly anytime. Access continues until the end of the current month. No pro-rata refund for partially-used months.</p>
        </Section>

        <Section title="4. Refunds we cannot give">
          <ul className="list-disc pl-5 space-y-2">
            <li>After the refund window (7d Monthly / 30d Yearly).</li>
            <li>If your account was terminated for Terms of Service violation (volume bot abuse outside our anti-flag parameters, sanctioned activity, payment chargebacks).</li>
            <li>For consumed third-party costs we paid on your behalf (e.g., dedicated proxy reservations, custom infrastructure setup for Enterprise).</li>
            <li>For losses incurred while using the platform — Offivex is a tool, you remain responsible for trading and launch decisions.</li>
          </ul>
        </Section>

        <Section title="5. Chargebacks">
          <p>If you dispute a charge with your bank without contacting us first, we will:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Submit evidence of service delivery (logs, API calls, wallet activity).</li>
            <li>Suspend the account until resolution.</li>
            <li>If the chargeback succeeds, the account is permanently terminated.</li>
          </ul>
          <p className="mt-3">Talk to us first — refunds resolved directly are faster and won&apos;t affect your future ability to subscribe.</p>
        </Section>

        <Section title="6. Enterprise plans">
          <p>Enterprise contracts (custom infrastructure, dedicated RPC nodes, on-call SLA) have a 14-day paid pilot during which a 100% refund is available. After the pilot, refunds follow the terms in your signed contract.</p>
        </Section>

        <Section title="7. Contact">
          <p>
            Refund questions :
            <a href="mailto:billing@offivex.io" className="text-offivex-purple-light hover:text-white underline ml-1">billing@offivex.io</a>
            {" "}— or DM us on Telegram if your account is in good standing.
          </p>
          <p className="mt-6">
            <Link href="/pricing" className="text-offivex-purple-light hover:text-white transition-colors text-sm">
              ← Back to Pricing
            </Link>
          </p>
        </Section>
      </article>
    </MarketingShell>
  );
}

function RefundCard({
  plan,
  price,
  window: refundWindow,
  condition,
  highlight = false,
}: {
  plan: string;
  price: string;
  window: string;
  condition: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-6 ${
      highlight
        ? "border border-offivex-purple/30 bg-gradient-to-b from-offivex-purple/[0.10] via-offivex-purple/[0.02] to-transparent"
        : "border border-white/[0.08] bg-white/[0.02]"
    }`}>
      <div className="text-xs uppercase tracking-wider text-offivex-text-muted mb-1">{plan}</div>
      <div className="font-display text-2xl font-bold mb-1">{price}</div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold text-offivex-purple-light">{refundWindow}</span>
        <span className="text-xs text-offivex-text-muted">refund window</span>
      </div>
      <p className="text-sm text-offivex-text-secondary leading-relaxed">{condition}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl md:text-2xl font-semibold text-white mb-4 tracking-tight">{title}</h2>
      <div className="text-sm text-offivex-text-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
