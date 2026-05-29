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
  { id: "prereq", label: "Pre-requisites" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "reference", label: "Field reference" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function MemeLibraryDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Meme Library"
      intro="Upload, organize, and re-use the images and metadata templates that drive your launches. Every image you upload here is pinned to IPFS once and reusable across mints — no re-uploading the same PNG for every launch."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/pump-fun", label: "Pump.fun" }}
      next={{ href: "/docs/feature/manual-trade", label: "Manual Trade" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/meme-library</DocCode> is the asset side of token launches.
          You upload PNG/JPG/WebP files, they&rsquo;re hashed (SHA-256 for
          integrity), stored locally under <DocCode>data/meme_assets/</DocCode>,
          and pinned to IPFS via Pinata. Each asset gets a permanent IPFS CID
          you can reference from <Link href="/docs/feature/mint" className="text-offivex-purple-light underline">Mint Token</Link>{" "}
          and <Link href="/docs/feature/pump-fun" className="text-offivex-purple-light underline">Pump.fun</Link>.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>You&rsquo;re building a series of launches with consistent branding (multiple variants of the same image).</li>
          <li>You want to pre-pin assets the night before a launch so the launch transaction itself doesn&rsquo;t depend on Pinata being up.</li>
          <li>You want a local audit trail of every image you&rsquo;ve published, with SHA-256 hashes to spot tampering.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Vault unlocked.</li>
          <li><DocCode>PINATA_JWT</DocCode> set in Settings for cloud pinning (strongly recommended for mainnet).</li>
          <li>Source assets ≤ 10 MB each.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /meme-library", body: <>You see the grid of previously uploaded assets, each with its CID and a copy button.</> },
            { title: "Click Upload", body: <>Drag a file in or pick from a file dialog. PNG/JPG/WebP, ≤10 MB.</> },
            { title: "Wait for pinning", body: <>The page hashes the file, writes it locally, uploads to Pinata, and stores the resulting CID. Typical latency: 1–4 seconds depending on file size and Pinata load.</> },
            { title: "Copy the CID or gateway URL", body: <>Use the copy buttons. The gateway URL is what Phantom/Solscan will fetch when rendering metadata.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="f">file</DocCode>, "binary", "PNG/JPG/WebP, ≤10 MB. Validated server-side."],
            [<DocCode key="n">name</DocCode>, "string", "Local label only. Defaults to filename."],
            [<DocCode key="ta">tags[]</DocCode>, "string[]", "Optional. Used for filtering in the grid."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li><strong>Local first:</strong> The file is written to <DocCode>data/meme_assets/{`{sha256}`}.{`{ext}`}</DocCode>. The hash is the primary key, so re-uploading the same image is a no-op.</li>
          <li><strong>Pinata pin:</strong> If <DocCode>PINATA_JWT</DocCode> is set, the file is uploaded via <DocCode>POST pinata.cloud/pinning/pinFileToIPFS</DocCode>. The returned CID is stored alongside the local row.</li>
          <li><strong>Size guard:</strong> 10 MB hard limit applied both client-side (preview) and server-side (<DocCode>meme/pinning.rs</DocCode>) — anything larger is rejected.</li>
          <li><strong>Gateway URLs:</strong> The page renders gateway URLs of the form <DocCode>https://gateway.pinata.cloud/ipfs/{`{cid}`}</DocCode>. Use these when you want a browser-loadable URL; use raw <DocCode>ipfs://{`{cid}`}</DocCode> when storing in on-chain metadata.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">File too large</DocCode>, "Source > 10 MB.", "Compress (TinyPNG, Squoosh) to ≤1 MB for snappy wallet loads."],
            [<DocCode key="e2">Pinata 401</DocCode>, "Bad/expired JWT.", <>Regenerate the JWT in your Pinata account and update <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>.</>],
            [<DocCode key="e3">Image renders broken on Solscan</DocCode>, "CID propagating, or gateway cold-cached.", "Wait 1–2 minutes; CIDs propagate via the public IPFS DHT."],
          ]}
        />
      </DocSection>

      <DocCallout variant="tip" title="Pin before you launch">
        Pinata occasionally throttles uploads during high load. Pinning your
        launch image 24+ hours in advance removes that variable from the
        launch hot path.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/mint" className="text-offivex-purple-light underline">Mint Token</Link> — pick an asset from the library at mint time.</li>
          <li><Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link> — configure your Pinata JWT.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
