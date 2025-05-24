'use client';

import {
  UserButton,
  useUser,
  SignedIn,
  SignedOut,
  SignInButton,
  useSession
} from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export function UserProfile() {
  const { isSignedIn, user, isLoaded } = useUser();
  const { session } = useSession();

  // Set the auth token when the user is signed in
  useEffect(() => {
    const setAuthToken = async () => {
      if (isSignedIn && isLoaded && session) {
        try {
          const token = await session.getToken();
          if (token) {
            // Set auth token for API calls
            apiClient.setAuthToken(token);
          }
        } catch (error) {
          console.error('Error getting token:', error);
        }
      }
    };

    setAuthToken();
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
        <SignInButton mode="modal">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
        </SignInButton>
      </SignedOut>
    </div>
  );
}
