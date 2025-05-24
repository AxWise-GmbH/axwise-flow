'use client';

import {
  UserButton,
  useUser,
  SignedIn,
  SignedOut,
  useSession
} from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { isClerkConfigured } from '@/lib/clerk-config';
import Link from 'next/link';

// Component that uses Clerk hooks - only rendered when Clerk is available
function ClerkUserProfile(): JSX.Element {
  const { isSignedIn, user, isLoaded } = useUser();
  const { session } = useSession();

  // Set or clear the auth token based on sign-in status
  useEffect(() => {
    const manageAuthToken = async () => {
      if (isSignedIn && isLoaded && session) {
        try {
          const token = await session.getToken();
          if (token) {
            console.log('Auth token set');
            apiClient.setAuthToken(token);
          }
        } catch (error) {
          console.error('Error getting token:', error);
        }
      } else if (isLoaded && !isSignedIn) {
        // Clear auth token when user is signed out
        console.log('Auth token cleared');
        apiClient.clearAuthToken();
      }
    };

    manageAuthToken();
  }, [isSignedIn, isLoaded, session]);

  return (
    <div className="flex items-center gap-4">
      <SignedIn>
        {isLoaded && user && (
          <div className="flex items-center gap-2">
            <span className="text-sm hidden md:block">
              {user.firstName || user.username || 'User'}
            </span>
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  userButtonAvatarBox: 'w-8 h-8',
                }
              }}
            />
          </div>
        )}
      </SignedIn>
      <SignedOut>
        <Link href="/sign-in">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
        </Link>
      </SignedOut>
    </div>
  );
}

// Main UserProfile component that conditionally renders based on Clerk configuration
export function UserProfile(): JSX.Element {
  // Development mode fallback when Clerk is not configured
  if (!isClerkConfigured) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-yellow-600 dark:text-yellow-400">
            Dev Mode
          </span>
          <Link href="/sign-in">
            <Button variant="outline" size="sm">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Render Clerk-enabled component when Clerk is configured
  return <ClerkUserProfile />;
}
