/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Removed 'output: export' to enable SSR with Firebase
  env: {
    NEXT_PUBLIC_...=***REMOVED*** || 'http://localhost:8000',
  },
  images: {
    domains: [
      'axwise-73425.firebaseapp.com',
      'axwise-73425.firebasestorage.app',
      'axwise-flow--axwise-73425.europe-west4.hosted.app'
    ],
  },

  // Enable server actions for SSR
  experimental: {
    serverActions: true,
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
}

module.exports = nextConfig
