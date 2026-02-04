import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGate } from "@/components/auth/AuthGate";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cresus - Solana Launch Platform",
  description: "Token launch, bundling, and wallet management for Solana",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${notoSans.className} min-h-screen bg-gray-950 text-gray-100`}>
        <ToastProvider>
          <AuthGate>
            <div className="flex h-screen">
              <Sidebar />
              <main className="flex-1 overflow-auto p-6">
                <ErrorBoundary>{children}</ErrorBoundary>
              </main>
            </div>
          </AuthGate>
        </ToastProvider>
      </body>
    </html>
  );
}
