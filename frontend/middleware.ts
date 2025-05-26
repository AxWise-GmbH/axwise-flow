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
  '/api/webhook(.*)', // Allow webhooks
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
  '/firebase-test(.*)',
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

  // Protect routes that require authentication
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // For any other routes not explicitly defined, allow them
});

// Use Clerk's recommended matcher configuration
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
