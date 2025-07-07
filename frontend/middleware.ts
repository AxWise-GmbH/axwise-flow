import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes that should be accessible without authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/contact',
  '/impressum',
  '/privacy-policy',
  '/terms-of-service',
  '/pricing',
  '/roadmap',
  '/onepager-presentation(.*)',
  '/workshop-designthinking(.*)',
  '/blog(.*)', // Allow blog access
  '/customer-research(.*)', // Allow customer research feature
  '/api/webhook(.*)', // Allow webhooks
  '/api/research(.*)', // Allow research API routes
  '/api/upload', // Allow upload API route (handles auth internally)
  '/api/prd(.*)', // Allow PRD API routes (handles auth internally)
  '/api/analyses(.*)', // Allow analyses API routes (handles auth internally)
  '/api/analyze', // Allow analyze API route (handles auth internally)
  '/api/history', // Allow history API route (handles auth internally)
  '/api/results(.*)', // Allow results API routes (handles auth internally)
  '/api/analysis(.*)', // Allow analysis API routes (handles auth internally)
  '/api/blog(.*)', // Allow blog API routes
  '/api/health', // Allow health check
  '/api/protected', // Allow protected route (handles auth internally)
]);

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/unified-dashboard(.*)',
  '/unified-dashboard',
  '/results(.*)',
  '/analysis(.*)',
  '/settings(.*)',
  '/profile(.*)',
  '/admin(.*)',
  '/clerk-debug(.*)',
  '/firebase-official(.*)',
  '/fetch-debug(.*)',
  '/integration-test(.*)',
  '/test-clerk(.*)'
]);

// Simplified Clerk middleware using recommended patterns
export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return;
  }

  // Check if Clerk validation is disabled in development
  const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  // Protect routes that require authentication (only if Clerk validation is enabled or in production)
  if (isProtectedRoute(req) && (isProduction || enableClerkValidation)) {
    await auth.protect();
  }

  // For any other routes not explicitly defined, allow them
});

// Use Clerk's recommended matcher configuration
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    // Also skip our legacy static HTML pages
    '/((?!_next|onepager-presentation|workshop-designthinking|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
