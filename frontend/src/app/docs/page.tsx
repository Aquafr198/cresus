"use client";

import Link from "next/link";
import {
  BookOpenIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  AcademicCapIcon,
  BoltIcon,
  CpuChipIcon,
} from "@heroicons/react/24/solid";

const TUTORIAL_DOCS = [
  {
    href: "/docs/tutorial",
    title: "Step-by-Step Tutorial",
    description:
      "Complete walkthrough from setup to token launch — follow every step from A to Z to master the platform.",
    color: "text-indigo-400",
    bgColor: "bg-indigo-900/20",
    borderColor: "border-indigo-800",
    icon: AcademicCapIcon,
    badge: "Recommended",
  },
  {
    href: "/docs/quick-start",
    title: "Quick Start",
    description:
      "Already familiar with Solana tools? Get up and running in 5 minutes with the essentials.",
    color: "text-green-400",
    bgColor: "bg-green-900/20",
    borderColor: "border-green-800",
    icon: BoltIcon,
  },
];

const TECHNICAL_DOCS = [
  {
    href: "/docs/features",
    title: "Features Reference",
    description:
      "Detailed technical documentation of every feature — minting, bundles, bots, distribution, and more.",
    color: "text-purple-400",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-800",
    icon: CpuChipIcon,
  },
  {
    href: "/docs/user-guide",
    title: "Architecture & Concepts",
    description:
      "Understand the system internals — wallet encryption, RPC management, database, and API architecture.",
    color: "text-blue-400",
    bgColor: "bg-blue-900/20",
    borderColor: "border-blue-800",
    icon: BookOpenIcon,
  },
  {
    href: "/docs/security",
    title: "Security Best Practices",
    description:
      "Critical security guidelines — protect your funds, private keys, and operational setup.",
    color: "text-red-400",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-800",
    icon: ShieldCheckIcon,
  },
];

interface DocCard {
  href: string;
  title: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  badge?: string;
}

function DocCardComponent({ doc }: { doc: DocCard }) {
  const Icon = doc.icon;
  return (
    <Link
      href={doc.href}
      className={`group relative block p-6 rounded-xl border ${doc.bgColor} ${doc.borderColor} hover:scale-[1.02] hover:shadow-lg hover:border-opacity-80 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 focus:ring-indigo-500`}
    >
      {doc.badge && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          {doc.badge}
        </span>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`p-2 rounded-lg ${doc.bgColor} group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon className={`w-6 h-6 ${doc.color}`} />
        </div>
        <h3
          className={`text-xl font-semibold ${doc.color} group-hover:brightness-110 transition-all`}
        >
          {doc.title}
        </h3>
      </div>
      <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-300 transition-colors">
        {doc.description}
      </p>
    </Link>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Documentation</h1>
        <p className="text-gray-400">
          Tutorials, guides, and technical reference for the Cresus platform.
        </p>
      </div>

      {/* Tutorial Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <RocketLaunchIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-gray-200">
            Get Started
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          New to Cresus? Start with the step-by-step tutorial to learn
          everything from wallet creation to launching your token.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {TUTORIAL_DOCS.map((doc) => (
            <DocCardComponent key={doc.href} doc={doc} />
          ))}
        </div>
      </section>

      {/* Technical Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CpuChipIcon className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-200">
            Technical Reference
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          In-depth documentation on features, architecture, and security for
          advanced users.
        </p>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TECHNICAL_DOCS.map((doc) => (
            <DocCardComponent key={doc.href} doc={doc} />
          ))}
        </div>
      </section>
    </div>
  );
}
