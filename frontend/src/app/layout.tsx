import type { Metadata } from "next";
import { Figtree, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthGate } from "@/components/auth/AuthGate";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { SwrProvider } from "@/components/providers/SwrProvider";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-figtree",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-bricolage",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Offivex — The Solana Launch Stack",
  description: "Premium launchpad infrastructure for Solana teams. Volume bots, snipers, multi-wallet, anti-flag. Invite only.",
  // Favicon is generated dynamically by src/app/icon.tsx (Satori ImageResponse).
  // Apple touch icon falls back to the same logo via the convention below.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable} ${jetbrainsMono.variable}`}>
      <body
        className="min-h-screen bg-offivex-bg-base text-offivex-text-primary antialiased"
        suppressHydrationWarning
      >
        <SwrProvider>
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </SwrProvider>
      </body>
    </html>
  );
}
