"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthGate";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "~" },
  { href: "/wallets", label: "Wallets", icon: "W" },
  { href: "/mint", label: "Mint Token", icon: "M" },
  { href: "/bundle", label: "Bundle/Launch", icon: "B" },
  { href: "/meme-library", label: "Meme Library", icon: "L" },
  { href: "/distribution", label: "Distribution", icon: "D" },
  { href: "/profiles", label: "Profiles", icon: "P" },
  { href: "/monitor", label: "Monitor", icon: "T" },
  { href: "/settings", label: "Settings", icon: "S" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { handleLock } = useAuth();

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-indigo-400">CRESUS</h1>
        <p className="text-xs text-gray-500 mt-1">Solana Launch Platform</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 text-xs font-mono">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 space-y-2">
        <button
          onClick={handleLock}
          className="w-full px-3 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors text-left"
        >
          Lock App
        </button>
        <p className="text-xs text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}
