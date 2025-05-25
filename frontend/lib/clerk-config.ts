'use client';

/**
 * Simplified Clerk configuration for Firebase App Hosting
 * This file provides basic utilities for Clerk authentication
 */

// Check if Clerk is configured and valid (runtime check)
export function isClerkConfigured(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (typeof publishableKey !== 'string' || publishableKey === '') {
    console.log('Clerk not configured: No publishable key found');
    return false;
  }

  if (publishableKey === 'your_clerk_publishable_key_here' ||
      publishableKey.includes('placeholder') ||
      publishableKey.includes('disabled')) {
    console.log('Clerk not configured: Placeholder or disabled key');
    return false;
  }

  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    console.log('Clerk not configured: Invalid key format');
    return false;
  }

  console.log('Clerk configured successfully:', {
    keyPrefix: publishableKey.substring(0, 20) + '...',
    isTest: publishableKey.startsWith('pk_test_'),
    isLive: publishableKey.startsWith('pk_live_')
  });

  return true;
}

/**
 * Get Clerk configuration for the ClerkProvider component
 * Simplified configuration for Firebase App Hosting
 */
export function getClerkProviderConfig() {
  return {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
    domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN,
    signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
    signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
    afterSignInUrl: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL || '/unified-dashboard',
    afterSignUpUrl: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL || '/unified-dashboard',
    appearance: {
      baseTheme: undefined, // Use system theme
      variables: {
        colorPrimary: '#2563eb', // blue-600
        colorText: '#1f2937', // gray-800
        colorBackground: '#ffffff', // white
        colorDanger: '#dc2626', // red-600
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: '0.5rem'
      }
    }
  };
}
