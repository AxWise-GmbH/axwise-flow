import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clerkMiddleware, getAuth } from '@clerk/nextjs/server';

// Check if Clerk is configured
const isClerkConfigured = process.env.CLERK_SECRET_KEY &&
  process.env.CLERK_SECRET_KEY !== 'your_clerk_secret_key_here';

// Create a middleware function that conditionally applies Clerk middleware
const middleware = (req: NextRequest) => {
  // If Clerk is not configured, bypass authentication
  if (!isClerkConfigured) {
    console.warn('Clerk authentication is not configured. Running without authentication.');
    return NextResponse.next();
  }

  // Apply Clerk middleware if configured
  return clerkMiddleware()(req);
};

export default middleware;

// Configure matcher with simpler pattern that doesn't use capturing groups
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next (Next.js internals)
     * - public (public files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next|public|favicon.ico).*)',
  ],
};
