"use client";

import Link from "next/link";
import {
  DocLayout,
  DocSection,
  DocCode,
  DocTable,
  DocSteps,
} from "../../_components/DocLayout";
import { DocCallout } from "../../_components/DocCallout";

const TOC = [
  { id: "what", label: "What it does" },
  { id: "when", label: "When to use it" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "types", label: "Template types" },
  { id: "reference", label: "API reference" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls" },
  { id: "related", label: "Related" },
];

export default function TasksDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Launch Tasks (Templates)"
      intro="Save a launch configuration once — mint, bundle, or Pump.fun — then re-execute it at the moment you want with a single click. Closes the Kinesis 'Mint Task / Pump Task' pattern for pro launchers who prepare a launch hours before the trigger event."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/meme-library", label: "Meme Library" }}
      next={{ href: "/docs/feature/manual-trade", label: "Manual Trade" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          The <DocCode>/tasks</DocCode> page lists every launch template
          you&rsquo;ve saved, grouped by type (Mint / Bundle / Pump.fun).
          Each template contains the full launch configuration the way you
          set it on the original page. Clicking <strong>Execute</strong> on
          a template pre-fills the matching launch page so you can review
          and ship in one more click.
        </p>
        <p className="text-gray-300 leading-relaxed mt-3">
          Nothing on-chain happens until you actually click Launch / Mint /
          Create on the target page — Tasks are local saved configs, not
          scheduled jobs.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            <strong className="text-gray-100">Pre-announce coordination</strong>:
            prepare your launch hours in advance, then trigger it at exactly
            the moment your Twitter announcement goes out.
          </li>
          <li>
            <strong className="text-gray-100">Multi-day planning</strong>:
            configure tonight, sleep, execute fresh tomorrow.
          </li>
          <li>
            <strong className="text-gray-100">Repeated launches</strong>:
            you run the same bundle config across multiple mints — save once
            and re-execute with the mint swap as the only change.
          </li>
          <li>
            <strong className="text-gray-100">A/B variants</strong>: save
            multiple configurations of the same launch (different snipe
            wallet sets, slippages) and decide last-minute which to fire.
          </li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            {
              title: "Configure the launch on its native page",
              body: (
                <>
                  Open <DocCode>/mint</DocCode>, <DocCode>/bundle</DocCode>,
                  or <DocCode>/pump-fun</DocCode>. Fill the form completely
                  (name, symbol, image, snipe wallets, slippage, etc.).
                </>
              ),
            },
            {
              title: "Click 'Save as Task'",
              body: (
                <>
                  Right next to the main Launch / Mint / Create button.
                  You&rsquo;ll be prompted for an optional name (used to
                  identify the template later on /tasks).
                </>
              ),
            },
            {
              title: "Verify on /tasks",
              body: (
                <>
                  The new template appears at the top of the matching group
                  with timestamp &ldquo;just now&rdquo;. Hover the row to see
                  the saved values.
                </>
              ),
            },
            {
              title: "Execute when ready",
              body: (
                <>
                  Click <strong>Execute</strong>. The page navigates to the
                  matching launch page with all fields pre-filled. Review
                  the values one last time, then click the main launch
                  button to actually ship the on-chain transaction.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="types" title="Template types">
        <DocTable
          headers={["task_type", "Origin page", "Captures"]}
          rows={[
            [
              <DocCode key="m">mint_template</DocCode>,
              <Link href="/mint" key="ml" className="text-offivex-purple-light underline">/mint</Link>,
              "name, symbol, decimals, supply, metadata URI, creator wallet, description, image, twitter, telegram, website",
            ],
            [
              <DocCode key="b">bundle_template</DocCode>,
              <Link href="/bundle" key="bl" className="text-offivex-purple-light underline">/bundle</Link>,
              "mint, creator wallet, SOL liquidity, token liquidity, Jito tip, creator reserve, snipe-buy rows",
            ],
            [
              <DocCode key="p">pump_fun_template</DocCode>,
              <Link href="/pump-fun" key="pl" className="text-offivex-purple-light underline">/pump-fun</Link>,
              "token name + symbol + description, image URL, creator wallet, initial buy SOL, socials",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="API reference">
        <DocTable
          headers={["Endpoint", "Notes"]}
          rows={[
            [<DocCode key="l">GET /api/v1/tasks</DocCode>, "List all saved templates (all 3 types)"],
            [<DocCode key="c">POST /api/v1/tasks</DocCode>, "Create a template. Body: { task_type, config_blob, label? }"],
            [<DocCode key="g">GET /api/v1/tasks/:id</DocCode>, "Fetch one template"],
            [<DocCode key="e">POST /api/v1/tasks/:id/execute</DocCode>, "Return the blob so the calling page can pre-fill its form. Bumps updated_at."],
            [<DocCode key="d">DELETE /api/v1/tasks/:id</DocCode>, "Remove a template"],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>
            <strong>Storage</strong>: re-uses the existing{" "}
            <DocCode>tasks</DocCode> SQLite table by adding new{" "}
            <DocCode>task_type</DocCode> values (
            <DocCode>mint_template</DocCode>, <DocCode>bundle_template</DocCode>
            , <DocCode>pump_fun_template</DocCode>) and storing the launch
            payload as serialized JSON in a new <DocCode>config_blob</DocCode>{" "}
            column (migration 029).
          </li>
          <li>
            <strong>Execute flow</strong>: the backend doesn&rsquo;t chain
            into mint/bundle/pump-fun endpoints itself — that would bypass
            their auth + plan + unlock middleware. Instead the /execute
            endpoint just returns the saved blob; the frontend stashes it
            in <DocCode>sessionStorage</DocCode> under a one-shot key, then
            navigates to the matching page which reads + clears the key on
            mount and re-fills its form.
          </li>
          <li>
            <strong>Audit</strong>: every save / delete / execute writes an{" "}
            <DocCode>audit_log</DocCode> row tagged{" "}
            <DocCode>user_op_task_template_*</DocCode>. The execute audit
            preserves a trail of &ldquo;which template was used at what time&rdquo;.
          </li>
          <li>
            <strong>Status field</strong>: a template lives in status{" "}
            <DocCode>saved</DocCode> until its first execute, which bumps it
            to <DocCode>executed</DocCode>. Future executes also stay on{" "}
            <DocCode>executed</DocCode> but the <DocCode>updated_at</DocCode>{" "}
            advances so the list shows &ldquo;last used&rdquo;.
          </li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls">
        <DocTable
          headers={["Trap", "What to do"]}
          rows={[
            [
              "Template references a wallet that no longer exists",
              "The pre-fill silently skips that field. You'll see an empty Wallet selector — re-pick before Launch.",
            ],
            [
              "Template image URL pointed to a Pinata pin that you've since unpinned",
              <span key="t2">
                Pinata pins are forever unless explicitly unpinned. If you{" "}
                <em>did</em> unpin, the wallet apps will show a broken image
                once the launch lands. Re-upload via{" "}
                <Link href="/docs/feature/meme-library" className="text-offivex-purple-light underline">Meme Library</Link>{" "}
                first.
              </span>,
            ],
            [
              "Two templates with the same label",
              "The label is for your eyes only — duplicates are fine. The system uses the (random) id for execute / delete.",
            ],
            [
              "Refreshing the launch page after pre-fill clears the form",
              "The sessionStorage key is one-shot by design. To re-execute, go back to /tasks and click Execute again.",
            ],
            [
              "You expected the template to fire automatically at a future time",
              "Tasks are NOT scheduled jobs — they're saved configs. You always have to click Launch on the target page yourself. Scheduling is hors-scope for v1.",
            ],
          ]}
        />
        <DocCallout variant="info" title="Safety by design">
          The execute flow forces a final human confirmation on the launch
          page — the saved template can never silently spend on-chain
          without a fresh click. This is intentional: a stale template
          with a wrong snipe-set should be caught at review time.
        </DocCallout>
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li>
            <Link
              href="/docs/feature/mint"
              className="text-offivex-purple-light underline"
            >
              Mint Token
            </Link>{" "}
            — has the Save as Task button.
          </li>
          <li>
            <Link
              href="/docs/feature/bundle"
              className="text-offivex-purple-light underline"
            >
              Bundle Launch
            </Link>{" "}
            — same.
          </li>
          <li>
            <Link
              href="/docs/feature/pump-fun"
              className="text-offivex-purple-light underline"
            >
              Pump.fun
            </Link>{" "}
            — same.
          </li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
