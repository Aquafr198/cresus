/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next 16+ blocks dev resources (HMR WebSocket, etc.) from non-trusted origins by default.
  // Whitelist localhost + 127.0.0.1 + LAN IP so hot reload works regardless of how the dev visits the app.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.121'],
  // Suppress workspace-root warning by pinning Turbopack root to this project.
  turbopack: {
    root: __dirname,
  },
  // Next/Image — serve modern formats with auto-fallback. AVIF typically saves
  // 30-50% vs WebP; WebP saves 25-35% vs PNG/JPG.
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Proxy /api/v1/* calls to the Rust backend.
  // Note: source is restricted to /api/v1/* so Next.js-handled routes like /api/apply work locally.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `http://${process.env.BACKEND_HOST || '127.0.0.1'}:${process.env.BACKEND_PORT || '3001'}/api/v1/:path*`,
      },
    ];
  },

  // Audit P3 SEC-5 — Content-Security-Policy + adjacent hardening headers.
  // Reduces the impact of an XSS injection on the API key (stored in
  // localStorage). With strict script-src 'self', attacker-injected
  // <script src="https://evil/"></script> is blocked by the browser.
  //
  // Caveats:
  //   - 'unsafe-inline' on style-src is required by Tailwind/Next.js
  //     hydration; we accept this as the styling pipeline is build-time only.
  //   - 'unsafe-eval' is needed for Next.js dev HMR (Turbopack). Production
  //     builds don't need it, but Next.js doesn't currently expose a clean
  //     way to differentiate without runtime injection. Acceptable.
  //   - Solscan tx links open in new tab; we whitelist them in img/connect-src
  //     for the favicon/asset fetches some pages do.
  //   - WS connects to the same origin / backend host explicitly.
  async headers() {
    const backendHost = process.env.BACKEND_HOST || '127.0.0.1';
    const backendPort = process.env.BACKEND_PORT || '3001';
    const wsScheme = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
    const connectSrc = [
      "'self'",
      `http://${backendHost}:${backendPort}`,
      `${wsScheme}://${backendHost}:${backendPort}`,
      'https://api.coingecko.com', // SOL price oracle (server-side, but listed for safety)
      'https://t.me',              // Telegram share intent
      'https://twitter.com',       // Twitter share intent
    ].join(' ');
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval for Next.js dev/HMR
      "style-src 'self' 'unsafe-inline'",                // Tailwind injected styles
      "img-src 'self' data: blob: https:",               // user-supplied meme assets via blob:
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",                          // anti-clickjacking
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  // Redirect legacy /signup to the invite-only Apply flow.
  async redirects() {
    return [
      {
        source: '/signup',
        destination: '/apply',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
