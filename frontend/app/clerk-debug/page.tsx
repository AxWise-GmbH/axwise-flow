'use client';

import { useAuth, useUser, SignInButton, SignUpButton, SignOutButton } from '@clerk/nextjs';
import { isClerkConfigured } from '@/lib/clerk-config';
import { useEffect, useState } from 'react';

/**
 * Clerk Debug Page
 * Simple page to test and debug Clerk authentication functionality
 */
export default function ClerkDebugPage() {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const { user } = useUser();
  const [clientSide, setClientSide] = useState(false);
  const [clerkConfigured, setClerkConfigured] = useState(false);

  useEffect(() => {
    setClientSide(true);
    setClerkConfigured(isClerkConfigured());
  }, []);

  if (!clientSide) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading Clerk Debug...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🔧 Clerk Debug & Test Page</h1>

        {/* Configuration Status */}
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuration Status</h2>
          <div className="space-y-2">
            <p><strong>Client Side Loaded:</strong> {clientSide ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Clerk Configured:</strong> {clerkConfigured ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Clerk Loaded:</strong> {isLoaded ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Environment:</strong> {process.env.NODE_ENV}</p>
            <p><strong>Publishable Key:</strong> {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.substring(0, 20)}...</p>
            <p><strong>Domain:</strong> {process.env.NEXT_PUBLIC_CLERK_DOMAIN}</p>
          </div>
        </div>

        {/* Authentication Status */}
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
          <div className="space-y-2">
            <p><strong>Is Signed In:</strong> {isSignedIn ? '✅ Yes' : '❌ No'}</p>
            <p><strong>User ID:</strong> {userId || 'Not available'}</p>
            <p><strong>Email:</strong> {user?.emailAddresses?.[0]?.emailAddress || 'Not available'}</p>
            <p><strong>First Name:</strong> {user?.firstName || 'Not available'}</p>
            <p><strong>Last Name:</strong> {user?.lastName || 'Not available'}</p>
          </div>
        </div>

        {/* Authentication Actions */}
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication Actions</h2>

          {!clerkConfigured ? (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
              <p className="text-yellow-800">⚠️ Clerk is not properly configured. Check your environment variables.</p>
            </div>
          ) : !isLoaded ? (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded">
              <p className="text-blue-800">⏳ Clerk is loading...</p>
            </div>
          ) : !isSignedIn ? (
            <div className="space-x-4">
              <SignInButton mode="modal">
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90">
                  🔑 Sign In (Modal)
                </button>
              </SignInButton>

              <SignInButton mode="redirect">
                <button className="bg-secondary text-secondary-foreground px-4 py-2 rounded hover:bg-secondary/90">
                  🔑 Sign In (Redirect)
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                  📝 Sign Up (Modal)
                </button>
              </SignUpButton>

              <SignUpButton mode="redirect">
                <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                  📝 Sign Up (Redirect)
                </button>
              </SignUpButton>
            </div>
          ) : (
            <div className="space-x-4">
              <SignOutButton>
                <button className="bg-destructive text-destructive-foreground px-4 py-2 rounded hover:bg-destructive/90">
                  🚪 Sign Out
                </button>
              </SignOutButton>

              <a
                href="/unified-dashboard"
                className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 inline-block"
              >
                📊 Go to Dashboard
              </a>
            </div>
          )}
        </div>

        {/* Browser Console Check */}
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Browser Console Check</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Open your browser console (F12) and check for any Clerk-related errors.
          </p>
          <button
            onClick={() => {
              console.log('=== CLERK DEBUG INFO ===');
              console.log('Window Clerk:', window.Clerk);
              console.log('Clerk Config:', {
                publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
                domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN,
                isLoaded,
                isSignedIn,
                userId
              });
              console.log('========================');
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            🔍 Log Debug Info to Console
          </button>
        </div>

        {/* Navigation */}
        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Navigation</h2>
          <div className="space-x-4">
            <a href="/sign-in" className="text-primary hover:underline">
              Go to Sign In Page
            </a>
            <a href="/sign-up" className="text-primary hover:underline">
              Go to Sign Up Page
            </a>
            <a href="/test-clerk" className="text-primary hover:underline">
              Go to Test Clerk Page
            </a>
            <a href="/firebase-official" className="text-primary hover:underline">
              Go to Firebase Official Page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
