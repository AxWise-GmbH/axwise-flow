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
}

module.exports = nextConfig
