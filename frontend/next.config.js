const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Output configuration for Firebase App Hosting
  output: 'standalone',

  // Environment variables
  env: {
    NEXT_PUBLIC_...=***REMOVED*** || 'http://localhost:8000',
  },

  // Image domains configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'axwise-73425.firebaseapp.com'
      },
      {
        protocol: 'https',
        hostname: 'axwise-73425.firebasestorage.app'
      },
      {
        protocol: 'https',
        hostname: 'axwise-flow--axwise-73425.europe-west4.hosted.app'
      }
    ],
  },

  // Enable server actions for SSR with proper configuration
  experimental: {
    serverActions: {
      allowedOrigins: [
        'axwise-flow--axwise-73425.europe-west4.hosted.app',
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

  // Properly handle middleware for Firebase App Hosting
  poweredByHeader: false,
  generateEtags: false,

  // Add rewrites for legacy static pages
  async rewrites() {
    return [
      {
        source: '/onepager-presentation',
        destination: '/onepager-presentation/index.html',
      },
      {
        source: '/workshop-designthinking',
        destination: '/workshop-designthinking/index.html',
      },
    ];
  },

  // Custom webpack configuration to ensure middleware manifest is in the right place
  webpack: (config, { isServer }) => {
    // This helps ensure middleware files are properly generated
    if (isServer) {
      config.optimization.moduleIds = 'named';
    }

    // Add path resolution for Firebase App Hosting compatibility
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
