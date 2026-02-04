/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Proxy API calls to the Rust backend during development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://${process.env.BACKEND_HOST || '127.0.0.1'}:${process.env.BACKEND_PORT || '3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
