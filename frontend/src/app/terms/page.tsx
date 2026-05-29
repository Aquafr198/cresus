import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <header className="mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Legal</div>
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-[0.98] mb-5">
            Terms of Service
          </h1>
          <p className="text-offivex-text-secondary text-sm">
            Last updated · 2026-05-20 · Operated from Dubai UAE
          </p>
        </header>

        <Intro>
          These Terms govern your access to and use of Offivex (&ldquo;the Service&rdquo;), provided
          on an invite-only basis. By submitting an application via{" "}
          <Link href="/apply" className="text-offivex-purple-light hover:text-white underline">
            /apply
          </Link>{" "}
          or by signing into an approved account, you agree to be bound by these Terms,
          our{" "}
          <Link href="/privacy" className="text-offivex-purple-light hover:text-white underline">
            Privacy Policy
          </Link>
          , and our{" "}
          <Link href="/refund" className="text-offivex-purple-light hover:text-white underline">
            Refund Policy
          </Link>
          . If you disagree with any part, do not use Offivex.
        </Intro>

        <Section title="1. The Service">
          <p>
            Offivex provides tooling to assist with Solana token launches, multi-wallet management,
            atomic bundle execution, trading automation, and related on-chain operations. We are a
            software provider, not a broker, dealer, exchange, custodian, advisor, or money
            transmitter. We do not offer financial, legal, or tax advice.
          </p>
        </Section>

        <Section title="2. Eligibility and accounts">
          <ul className="list-disc pl-5 space-y-2">
            <li>You must be at least 18 years old and have full legal capacity to contract.</li>
            <li>
              You must not be a resident of, or accessing Offivex from, a jurisdiction sanctioned by
              the UAE, EU, UK, or US (including OFAC SDN list).
            </li>
            <li>
              Access is invite-only. We reserve the right to accept or reject any application
              without explanation.
            </li>
            <li>
              You are responsible for keeping your password, seed phrase, and account credentials
              secure. We cannot recover a lost password — if you lose it without your seed phrase,
              your wallets are unrecoverable.
            </li>
            <li>
              One account per individual or organisation. Sharing credentials terminates the account.
            </li>
          </ul>
        </Section>

        <Section title="3. Acceptable use">
          <p>You may use Offivex only for lawful purposes. You agree NOT to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Violate any law, regulation, or third-party right in any jurisdiction.</li>
            <li>
              Conduct, facilitate, or assist in money laundering, terrorism financing, sanctions
              evasion, or other financial crime.
            </li>
            <li>
              Use Offivex to perpetrate fraud, rug pulls, exit scams, or any scheme intended to
              deceive token holders.
            </li>
            <li>
              Use Offivex against entities or markets where automated trading, bundle execution, or
              the underlying activity is unlawful in the relevant jurisdiction.
            </li>
            <li>
              Reverse-engineer, decompile, scrape, or extract the Service&apos;s source, internal
              APIs, ML models, anti-detection patterns, or proxy infrastructure.
            </li>
            <li>
              Rent, resell, sub-license, or grant access to Offivex to any third party without our
              prior written consent.
            </li>
            <li>
              Probe, attack, or attempt to disrupt the Service&apos;s availability or integrity
              (DDoS, credential stuffing, etc.).
            </li>
          </ul>
        </Section>

        <Section title="4. Self-custody">
          <p>
            Wallet private keys you generate or import into Offivex are encrypted client-side with
            a password only you know. We store the encrypted ciphertext and never see the plaintext
            key. <b className="text-offivex-text-primary">You are the sole custodian of your wallets and funds.</b>{" "}
            We have no ability to freeze, recover, refund, or reverse on-chain transactions you
            initiate. Losses caused by misplaced passwords, forgotten seed phrases, compromised
            devices, or operational error are your responsibility.
          </p>
        </Section>

        <Section title="5. Fees and subscriptions">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Current pricing is published on{" "}
              <Link href="/pricing" className="text-offivex-purple-light hover:text-white underline">
                /pricing
              </Link>
              . Fees are due in advance and non-refundable except as set out in our{" "}
              <Link href="/refund" className="text-offivex-purple-light hover:text-white underline">
                Refund Policy
              </Link>
              .
            </li>
            <li>
              Monthly subscriptions auto-renew each month. Yearly subscriptions auto-renew each
              year unless cancelled at least 24 hours before renewal.
            </li>
            <li>
              Payment is in crypto only (SOL, USDC-Solana, USDT-TRC20), processed by NOWPayments
              or directly to a verified Offivex wallet. We do not accept fiat, cards, or any
              fiat-rails processor. We are not liable for issues arising solely from third-party
              payment processors.
            </li>
            <li>
              We may change pricing for future billing cycles with at least 30 days&apos; notice
              by email. Existing pre-paid periods are honoured at the original price.
            </li>
            <li>
              You are responsible for any taxes, duties, or levies applicable to your purchase in
              your jurisdiction.
            </li>
          </ul>
        </Section>

        <Section title="6. Service availability">
          <p>
            We target 99.9% uptime monthly (excluding scheduled maintenance) on Yearly and
            Enterprise plans, best-effort on Monthly. The Service may be temporarily unavailable
            due to upstream infrastructure failures (Solana RPC outages, network congestion, proxy
            pool degradation, Pump.fun anti-bot waves). We are not liable for missed launch
            opportunities, slippage, failed snipes, or unfilled bundles caused by such conditions
            or by user configuration error.
          </p>
        </Section>

        <Section title="7. Intellectual property">
          <p>
            Offivex retains all rights, title, and interest in the Service, including software,
            documentation, anti-flag patterns, RPC routing logic, proxy pool composition,
            trademarks, and visual assets. You receive a personal, revocable, non-exclusive,
            non-transferable license to use the Service during your active subscription. No other
            licenses are granted.
          </p>
          <p className="mt-3">
            Content you upload (token metadata, images, project descriptions, etc.) remains yours.
            You grant us a worldwide, royalty-free licence solely to store, process, and display it
            as required to operate the Service.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <p>
            <b className="text-offivex-text-primary">The Service is provided &ldquo;as is&rdquo;</b>{" "}
            without warranties of any kind, express or implied, including merchantability, fitness
            for a particular purpose, non-infringement, accuracy, or uninterrupted operation. We do
            not warrant that:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Tokens you create will gain or maintain value, liquidity, or distribution.</li>
            <li>Trading bots will be profitable or avoid losses.</li>
            <li>Anti-flag patterns will succeed against current or future detection systems.</li>
            <li>The Service will be available or error-free at any specific time.</li>
          </ul>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            To the maximum extent permitted by applicable law, Offivex and its operators,
            employees, contractors, and partners shall not be liable for any indirect, incidental,
            special, consequential, exemplary, or punitive damages — including lost profits, lost
            tokens, slippage, missed opportunities, reputational harm, or data loss — arising out
            of or relating to your use of the Service.
          </p>
          <p className="mt-3">
            Our aggregate liability for all claims relating to the Service in any 12-month period
            shall not exceed the total fees you paid to Offivex during the preceding 12 months,
            capped at USD 10,000.
          </p>
        </Section>

        <Section title="10. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless Offivex and its operators from any
            claim, loss, liability, or expense (including reasonable legal fees) arising from: (a)
            your breach of these Terms; (b) your use of the Service in violation of any law; (c)
            content you upload or transactions you initiate; (d) third-party claims that your token
            launch, marketing, or trading activity damaged them.
          </p>
        </Section>

        <Section title="11. Termination">
          <ul className="list-disc pl-5 space-y-2">
            <li>You may cancel your subscription anytime from the billing page.</li>
            <li>
              We may suspend or terminate your account immediately if you breach these Terms, are
              involved in fraudulent or unlawful activity, initiate a chargeback without contacting
              us, or pose a security risk to the platform or other users.
            </li>
            <li>
              Upon termination, your access stops, your encrypted wallet payloads are scheduled for
              deletion 90 days after, and no fees are refunded except as permitted by the Refund
              Policy.
            </li>
            <li>
              Sections that by nature survive termination (IP, disclaimers, limitation of
              liability, indemnification, jurisdiction) remain in force.
            </li>
          </ul>
        </Section>

        <Section title="12. Modifications">
          <p>
            We may modify these Terms at any time. Material changes are emailed to active
            subscribers at least 30 days before taking effect. Continued use of the Service after
            the effective date constitutes acceptance. If you disagree, cancel your subscription
            before the effective date.
          </p>
        </Section>

        <Section title="13. Governing law and disputes">
          <p>
            These Terms are governed by the laws of the United Arab Emirates (federal law and the
            laws of the Emirate of Dubai), without regard to conflict-of-laws principles.
          </p>
          <p className="mt-3">
            Disputes shall be resolved exclusively before the courts of Dubai, UAE — unless we, at
            our sole option, elect to bring proceedings in the jurisdiction where you are
            domiciled. Both parties waive the right to a jury trial where applicable. You agree to
            bring any claim within one year of the event giving rise to it.
          </p>
        </Section>

        <Section title="14. Miscellaneous">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b className="text-offivex-text-primary">Entire agreement</b> — These Terms, together
              with the Privacy Policy and Refund Policy, constitute the entire agreement between
              you and Offivex.
            </li>
            <li>
              <b className="text-offivex-text-primary">Severability</b> — If any clause is held
              unenforceable, the remaining clauses stay in effect.
            </li>
            <li>
              <b className="text-offivex-text-primary">No waiver</b> — Failure to enforce a right
              is not a waiver of that right.
            </li>
            <li>
              <b className="text-offivex-text-primary">Assignment</b> — You may not assign your
              rights without our written consent. We may assign ours in connection with a merger,
              acquisition, or sale of assets.
            </li>
            <li>
              <b className="text-offivex-text-primary">Force majeure</b> — Neither party is liable
              for delays caused by events beyond reasonable control (network failures,
              governmental action, force majeure).
            </li>
          </ul>
        </Section>

        <Section title="15. Contact">
          <p>
            Legal questions or notice of dispute:
            <a href="mailto:legal@offivex.io" className="text-offivex-purple-light hover:text-white underline ml-1">
              legal@offivex.io
            </a>
          </p>
          <p className="mt-3">
            For billing, support, or general inquiries see the{" "}
            <Link href="/knowledge-base" className="text-offivex-purple-light hover:text-white underline">
              Knowledge base
            </Link>
            .
          </p>
        </Section>
      </article>
    </MarketingShell>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-12 text-sm text-offivex-text-secondary leading-relaxed">
      {children}
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
