"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthGate";
import {
  LayoutDashboard,
  Wallet,
  Coins,
  Rocket,
  ArrowLeftRight,
  BarChart3,
  TrendingUp,
  Flame,
  ImageIcon,
  Share2,
  Users,
  Activity,
  BookOpen,
  Settings,
  Lock,
  ChevronDown,
  Gift,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { QuickSellHUD } from "@/components/launch/QuickSellHUD";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/wallets", label: "Wallets", icon: Wallet },
      { href: "/referral", label: "Referral", icon: Gift },
    ],
  },
  {
    title: "Launches",
    defaultOpen: true,
    items: [
      { href: "/launches", label: "All launches", icon: Sparkles },
      { href: "/tasks", label: "Tasks", icon: BookOpen },
    ],
  },
  {
    title: "Token Launch",
    defaultOpen: true,
    items: [
      { href: "/mint", label: "Mint Token", icon: Coins },
      { href: "/bundle", label: "Bundle / Launch", icon: Rocket },
      { href: "/pump-fun", label: "Pump.fun", icon: Rocket },
      { href: "/meme-library", label: "Meme Library", icon: ImageIcon },
    ],
  },
  {
    title: "Trading Bots",
    defaultOpen: true,
    items: [
      { href: "/trade", label: "Manual Trade", icon: ArrowLeftRight },
      { href: "/volume", label: "Volume Bot", icon: BarChart3 },
      { href: "/bumper", label: "Bumper Bot", icon: TrendingUp },
      { href: "/warmer", label: "Wallet Warmer", icon: Flame },
    ],
  },
  {
    title: "Tools",
    defaultOpen: true,
    items: [
      { href: "/distribution", label: "Distribution", icon: Share2 },
      { href: "/profiles", label: "Profiles", icon: Users },
      { href: "/monitor", label: "Monitor", icon: Activity },
    ],
  },
  {
    title: "Help",
    defaultOpen: true,
    items: [
      { href: "/docs", label: "Documentation", icon: BookOpen },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function SidebarSection({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const [open, setOpen] = useState(section.defaultOpen ?? true);
  const hasActive = section.items.some((item) => pathname === item.href);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors"
      >
        {section.title}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offivex-purple/50 ${
                  isActive
                    ? "bg-offivex-purple/15 text-offivex-purple-light border border-offivex-purple/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isActive
                      ? "text-offivex-purple-light"
                      : "text-gray-500 group-hover:text-gray-300"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { handleLock } = useAuth();
  const [cluster, setCluster] = useState<string | null>(null);

  useEffect(() => {
    api.health().then((h) => setCluster(h.cluster ?? null)).catch(() => {});
  }, []);

  return (
    <aside className="w-60 bg-offivex-bg-surface border-r border-white/[0.06] flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Offivex"
            width={43}
            height={36}
            priority
          />
          <div>
            <h1 className="text-base font-display font-bold text-white tracking-wider">
              OFFIVEX
            </h1>
            <p className="text-[10px] text-gray-500 leading-none">
              Solana Launch Platform
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-thin">
        {NAV_SECTIONS.map((section) => (
          <SidebarSection
            key={section.title}
            section={section}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-white/[0.06] space-y-2">
        {/* Quick-sell armed-target HUD — always visible above the lock so
            the user knows which token F4/F5 will hit before they press. */}
        <QuickSellHUD />
        {/* Privacy Mode toggle — blurs sensitive values for stream/screen-share. */}
        <PrivacyToggle />
        <button
          onClick={handleLock}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-offivex-purple/50"
        >
          <Lock className="w-4 h-4" />
          Lock App
        </button>
        <div className="flex items-center gap-2 px-3">
          <p className="text-[10px] text-gray-600">v0.1.0</p>
          {cluster && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                cluster === "mainnet"
                  ? "bg-red-900/40 text-red-400 border border-red-800/50"
                  : "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50"
              }`}
            >
              {cluster}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
