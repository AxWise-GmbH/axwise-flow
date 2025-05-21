/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_...=***REMOVED*** || 'http://localhost:8000',
  },
  images: {
    domains: [],
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://grown-seasnail-35.clerk.accounts.dev https://clerk.grown-seasnail-35.accounts.dev https://*.googletagmanager.com;
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
              img-src 'self' data: https: blob:;
              font-src 'self' https://fonts.gstatic.com;
              connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'} https://grown-seasnail-35.clerk.accounts.dev https://clerk.grown-seasnail-35.accounts.dev https://*.googleapis.com;
              frame-src 'self' https://grown-seasnail-35.clerk.accounts.dev https://clerk.grown-seasnail-35.accounts.dev;
              object-src 'none';
              base-uri 'self';
              form-action 'self' https://grown-seasnail-35.clerk.accounts.dev https://clerk.grown-seasnail-35.accounts.dev;
              frame-ancestors 'self';
              upgrade-insecure-requests;
            `.replace(/\s+/g, ' ').trim()
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig
