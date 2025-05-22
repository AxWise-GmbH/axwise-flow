/**
 * Firebase and Clerk authentication synchronization utilities
 * This file handles the integration between Clerk and Firebase Authentication
 */
import { useEffect, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import {
  getAuth,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { app, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';

// Get Firebase Auth instance
const auth = getAuth(app);

/**
 * Custom hook to synchronize Clerk and Firebase authentication
 * This hook will:
 * 1. Listen for Clerk authentication state changes
 * 2. When a user signs in with Clerk, get a custom Firebase token
 * 3. Sign in to Firebase with the custom token
 * 4. When a user signs out of Clerk, sign out of Firebase
 */
export function useFirebaseAuth() {
  const { isSignedIn, getToken, userId } = useClerkAuth();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user);
        setIsLoading(false);
      },
      (error) => {
        setError(error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Create a callable reference to the Firebase function
  const generateFirebaseToken = httpsCallable(functions, 'generateFirebaseToken');

  // Synchronize Clerk auth state with Firebase
  useEffect(() => {
    async function syncAuthState() {
      try {
        if (isSignedIn && userId) {
          try {
            // First try to get a token directly from Clerk
            const clerkToken = await getToken();

            if (clerkToken) {
              // Call our Firebase function to exchange the Clerk token for a Firebase token
              const result = await generateFirebaseToken({ clerkUserId: userId });
              const { token: firebaseToken } = result.data as { token: string };

              if (firebaseToken) {
                // Sign in to Firebase with the custom token
                await signInWithCustomToken(auth, firebaseToken);
                console.log('Successfully signed in to Firebase');
              } else {
                throw new Error('Failed to get Firebase token');
              }
            } else {
              throw new Error('Failed to get Clerk token');
            }
          } catch (tokenError) {
            console.error('Error getting token:', tokenError);
            setError(tokenError instanceof Error ? tokenError : new Error(String(tokenError)));
          }
        } else if (!isSignedIn && firebaseUser) {
          // User is signed out of Clerk but still signed in to Firebase
          await firebaseSignOut(auth);
          console.log('Successfully signed out of Firebase');
        }
      } catch (err) {
        console.error('Error synchronizing auth state:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    }

    syncAuthState();
  }, [isSignedIn, userId, firebaseUser, getToken, generateFirebaseToken]);

  return {
    firebaseUser,
    isLoading,
    error,
  };
}

/**
 * Sign out of both Clerk and Firebase
 */
export async function signOutFromBoth() {
  try {
    // Sign out of Firebase first
    await firebaseSignOut(auth);

    // Clerk sign out is handled by the Clerk component
    return true;
  } catch (error) {
    console.error('Error signing out:', error);
    return false;
  }
}
