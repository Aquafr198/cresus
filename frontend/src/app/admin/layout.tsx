"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ADMIN_TOKEN_KEY } from "@/lib/api";

interface AdminLayoutProps {
  children: React.ReactNode;
}

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; username: string };

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/applies", label: "Applies" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/security", label: "Security" },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined"
      ? window.localStorage.getItem(ADMIN_TOKEN_KEY)
      : null;

    if (!token) {
      setAuth({ status: "anon" });
      if (!isLoginPage) router.replace("/admin/login");
      return;
    }

    api.admin
      .me()
      .then((res) => {
        if (cancelled) return;
        setAuth({ status: "authed", username: res.data.username });
      })
      .catch(() => {
        if (cancelled) return;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
        }
        setAuth({ status: "anon" });
        if (!isLoginPage) router.replace("/admin/login");
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, isLoginPage, router]);

  // Login page renders standalone (no shell, no guard).
  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary">
        {children}
      </div>
    );
  }

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex items-center justify-center">
        <div className="text-offivex-text-muted text-sm">Loading admin panel…</div>
      </div>
    );
  }

  if (auth.status === "anon") {
    // Redirect already in-flight; render nothing.
    return null;
  }

  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/[0.06] flex flex-col">
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-offivex-purple-light mb-1">
            Offivex
          </div>
          <div className="font-display text-lg font-semibold tracking-tight">Admin</div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname?.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "block px-3 py-2 rounded-lg text-sm transition-colors " +
                  (active
                    ? "bg-offivex-purple/15 text-white border border-offivex-purple/30"
                    : "text-offivex-text-secondary hover:text-white hover:bg-white/[0.04]")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/[0.06]">
          <div className="px-2 py-1 text-xs text-offivex-text-muted truncate">
            {auth.username}
          </div>
          <button
            onClick={async () => {
              try {
                await api.admin.logout();
              } catch {
                // ignore — we clear locally regardless
              }
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(ADMIN_TOKEN_KEY);
              }
              router.replace("/admin/login");
            }}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white hover:bg-white/[0.04] text-left transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
