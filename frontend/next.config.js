/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls to the Rust backend during development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
