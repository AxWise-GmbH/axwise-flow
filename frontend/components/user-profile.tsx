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
import Link from 'next/link';

// Component that uses Clerk hooks - only rendered when Clerk is available
function ClerkUserProfile(): JSX.Element {
  const { isSignedIn, user, isLoaded } = useUser();
  const { session } = useSession();

  // Set or clear the auth token based on sign-in status
  useEffect(() => {
    const manageAuthToken = async (): Promise<void> => {
      if (isSignedIn && isLoaded && session) {
        try {
          const token = await session.getToken();
          if (token) {
            // Set token in API client headers
            apiClient.setAuthToken(token);
            // Also store in localStorage for analysis functions
            if (typeof window !== 'undefined') {
              localStorage.setItem('auth_token', token);
              document.cookie = `auth_token=${token}; path=/; max-age=3600; SameSite=Lax`;
            }
          }
        } catch (error) {
          console.error('Error getting token:', error);
        }
      } else if (isLoaded && !isSignedIn) {
        apiClient.clearAuthToken();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
      }
    };

    manageAuthToken();
  }, [isSignedIn, isLoaded, session]);

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-4">
        <Link href="/sign-in">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <SignedIn>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm hidden md:block">
              {user.firstName || user.username || 'User'}
            </span>
            <UserButton
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

export function UserProfile(): JSX.Element {
  const clerkConfigured = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

  if (!clerkConfigured) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-yellow-600 dark:text-yellow-400">OSS Mode</span>
        <Link href="/unified-dashboard">
          <Button variant="outline" size="sm">
            Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return <ClerkUserProfile />;
}
