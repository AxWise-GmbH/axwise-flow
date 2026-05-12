/**
 * Firebase and Clerk authentication synchronization utilities
 * This file handles the integration between Clerk and Firebase Authentication
 */
import { useEffect, useState } from 'react';
import {
  getAuth,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { app } from './firebase';

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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Listen for Firebase auth state changes. 
  // Note: Clerk authentication state is handled globally via <ClerkProvider> and 
  // its token is retrieved via apiClient interception in authUtils.ts
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user);
        setIsLoading(false);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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
