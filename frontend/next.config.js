const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Output configuration for Cloud Run deployment
  output: 'standalone',

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },

  // Image domains configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'axwise.de'
      },
      {
        protocol: 'https',
        hostname: 'api.axwise.de'
      },
      {
        protocol: 'https',
        hostname: 'axwise-flow-oicbg7twja-ez.a.run.app'
      }
    ],
  },

  // Enable server actions for SSR with proper configuration
  experimental: {
    serverActions: {
      allowedOrigins: [
        'axwise.de',
        'axwise-flow-oicbg7twja-ez.a.run.app',
        'localhost:3000'
      ],
      bodySizeLimit: '2mb'
    },
  },

  // Disable TypeScript type checking during build for development
  // Remove this in production for better type safety
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },

  // Disable ESLint during build for faster builds
  // Remove this in production for better code quality
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Properly handle middleware for Cloud Run deployment
  poweredByHeader: false,
  generateEtags: false,

  // Add comprehensive security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      // Block access to sensitive files and directories
      {
        source: '/.git/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        source: '/.env:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        source: '/config/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },

  // Add redirects to block malicious requests
  async redirects() {
    return [
      // Block environment file access
      {
        source: '/.env:path*',
        destination: '/404',
        permanent: false,
      },
      {
        source: '/backend/.env:path*',
        destination: '/404',
        permanent: false,
      },
      {
        source: '/api/.env:path*',
        destination: '/404',
        permanent: false,
      },
      // Block git access
      {
        source: '/.git/:path*',
        destination: '/404',
        permanent: false,
      },
      // Block PHP info files
      {
        source: '/phpinfo:path*',
        destination: '/404',
        permanent: false,
      },
      {
        source: '/info.php',
        destination: '/404',
        permanent: false,
      },
      // Block AWS credentials
      {
        source: '/.aws/:path*',
        destination: '/404',
        permanent: false,
      },
      // Block config files
      {
        source: '/config.json',
        destination: '/404',
        permanent: false,
      },
      {
        source: '/config.yml',
        destination: '/404',
        permanent: false,
      },
      {
        source: '/config.yaml',
        destination: '/404',
        permanent: false,
      },
      // Redirect discord to contact page
      {
        source: '/discord',
        destination: '/contact',
        permanent: true,
      },
    ];
  },



  // Custom webpack configuration to ensure middleware manifest is in the right place
  webpack: (config, { isServer }) => {
    // This helps ensure middleware files are properly generated
    if (isServer) {
      config.optimization.moduleIds = 'named';
    }

    // Add path resolution for Cloud Run deployment compatibility
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
      '@/components': path.resolve(__dirname, 'components'),
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/styles': path.resolve(__dirname, 'styles'),
      '@/types': path.resolve(__dirname, 'types'),
      '@/utils': path.resolve(__dirname, 'utils'),
    };

    return config;
  },
}

module.exports = nextConfig
