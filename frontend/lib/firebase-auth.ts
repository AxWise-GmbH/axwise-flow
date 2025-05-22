'use client';

import { auth } from './firebase';
import { 
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  User,
  getIdToken
} from 'firebase/auth';
import { useEffect, useState } from 'react';

/**
 * Firebase Authentication utility functions
 * These functions provide a simplified interface for common auth operations
 * and integration with Clerk authentication
 */

/**
 * Sign in to Firebase with a custom token from Clerk
 * 
 * @param token The custom token from Clerk
 * @returns A promise that resolves when the user is signed in
 */
export async function signInWithClerkToken(token: string): Promise<User> {
  try {
    const userCredential = await signInWithCustomToken(auth, token);
    return userCredential.user;
  } catch (error) {
    console.error('Error signing in with custom token:', error);
    throw error;
  }
}

/**
 * Sign out from Firebase
 * 
 * @returns A promise that resolves when the user is signed out
 */
export async function signOutFromFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Get the current Firebase user
 * 
 * @returns The current user or null if not signed in
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Get the current user's ID token
 * 
 * @param forceRefresh Whether to force a token refresh
 * @returns A promise that resolves to the ID token or null if not signed in
 */
export async function getUserIdToken(forceRefresh: boolean = false): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    
    return await getIdToken(user, forceRefresh);
  } catch (error) {
    console.error('Error getting ID token:', error);
    return null;
  }
}

/**
 * Hook to get the current Firebase user
 * 
 * @returns An object with the current user, loading state, and error
 */
export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
        setLoading(false);
      },
      (error) => {
        setError(error);
        setLoading(false);
      }
    );
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);
  
  return { user, loading, error };
}

/**
 * Hook to synchronize Clerk and Firebase authentication
 * 
 * @param getClerkToken A function that returns a promise resolving to a Clerk token
 * @param isClerkSignedIn Whether the user is signed in with Clerk
 * @returns An object with the Firebase user, loading state, and error
 */
export function useSyncClerkWithFirebase(
  getClerkToken: () => Promise<string | null>,
  isClerkSignedIn: boolean
) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let unsubscribe: () => void;
    
    async function syncAuth() {
      try {
        if (isClerkSignedIn) {
          // Get token from Clerk
          const token = await getClerkToken();
          
          if (token) {
            // Sign in to Firebase with the token
            await signInWithCustomToken(auth, token);
          }
        } else if (!isClerkSignedIn && firebaseUser) {
          // Sign out from Firebase if signed out from Clerk
          await signOutFromFirebase();
        }
      } catch (err) {
        console.error('Error syncing auth:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
    
    // Subscribe to Firebase auth state changes
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    
    // Sync auth when Clerk auth state changes
    syncAuth();
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [isClerkSignedIn, getClerkToken, firebaseUser]);
  
  return { firebaseUser, loading, error };
}
