'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect, useCallback } from 'react';
import { getFirebaseInstances, isFirebaseEnabled } from '@/lib/firebase-safe';
import { signInWithCustomToken } from 'firebase/auth';

/**
 * Custom hook for automatic Clerk-Firebase integration
 * Automatically authenticates with Firebase when user signs in with Clerk
 */
export function useClerkFirebaseAuth() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [isFirebaseSignedIn, setIsFirebaseSignedIn] = useState(false);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Maximum retry attempts for Firebase authentication
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  /**
   * Authenticate with Firebase using Clerk token
   */
  const authenticateWithFirebase = useCallback(async (forceRetry = false) => {
    // Only proceed if Firebase is enabled and user is signed in with Clerk
    if (!isFirebaseEnabled || !isSignedIn || !userId || !isLoaded) {
      return false;
    }

    // Skip if already authenticated and not forcing retry
    if (isFirebaseSignedIn && !forceRetry) {
      return true;
    }

    setIsFirebaseLoading(true);
    setFirebaseError(null);

    try {
      const { auth } = getFirebaseInstances();
      
      if (!auth) {
        throw new Error('Firebase auth not initialized');
      }

      // Get Firebase token from Clerk using the official integration template
      console.log('🔥 Getting Firebase token from Clerk...');
      const token = await getToken({ template: 'integration_firebase' });
      
      if (!token) {
        throw new Error('Failed to get Firebase token from Clerk');
      }

      console.log('🔥 Signing into Firebase with Clerk token...');
      // Sign in to Firebase with the custom token
      const userCredentials = await signInWithCustomToken(auth, token);
      
      console.log('🔥 Firebase authentication successful:', userCredentials.user.uid);
      setIsFirebaseSignedIn(true);
      setRetryCount(0); // Reset retry count on success
      return true;

    } catch (error) {
      console.error('🔥 Firebase authentication error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to authenticate with Firebase';
      setFirebaseError(errorMessage);
      
      // Retry logic for transient errors
      if (retryCount < MAX_RETRIES && !forceRetry) {
        console.log(`🔥 Retrying Firebase authentication (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY}ms...`);
        setRetryCount(prev => prev + 1);
        
        setTimeout(() => {
          authenticateWithFirebase(false);
        }, RETRY_DELAY);
      }
      
      return false;
    } finally {
      setIsFirebaseLoading(false);
    }
  }, [getToken, userId, isSignedIn, isLoaded, isFirebaseSignedIn, retryCount]);

  /**
   * Manual retry function for user-initiated retries
   */
  const retryFirebaseAuth = useCallback(() => {
    setRetryCount(0); // Reset retry count for manual retry
    return authenticateWithFirebase(true);
  }, [authenticateWithFirebase]);

  /**
   * Sign out from Firebase
   */
  const signOutFromFirebase = useCallback(async () => {
    try {
      const { auth } = getFirebaseInstances();
      if (auth && auth.currentUser) {
        await auth.signOut();
        setIsFirebaseSignedIn(false);
        console.log('🔥 Signed out from Firebase');
      }
    } catch (error) {
      console.error('🔥 Error signing out from Firebase:', error);
    }
  }, []);

  // Automatic authentication when Clerk user signs in
  useEffect(() => {
    if (isLoaded && isSignedIn && userId && isFirebaseEnabled && !isFirebaseSignedIn && !isFirebaseLoading) {
      console.log('🔥 Clerk user signed in, automatically authenticating with Firebase...');
      authenticateWithFirebase(false);
    }
  }, [isLoaded, isSignedIn, userId, isFirebaseEnabled, isFirebaseSignedIn, isFirebaseLoading, authenticateWithFirebase]);

  // Sign out from Firebase when Clerk user signs out
  useEffect(() => {
    if (isLoaded && !isSignedIn && isFirebaseSignedIn) {
      console.log('🔥 Clerk user signed out, signing out from Firebase...');
      signOutFromFirebase();
    }
  }, [isLoaded, isSignedIn, isFirebaseSignedIn, signOutFromFirebase]);

  // Monitor Firebase auth state
  useEffect(() => {
    if (!isFirebaseEnabled) return;

    const { auth } = getFirebaseInstances();
    if (!auth) return;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      const wasSignedIn = isFirebaseSignedIn;
      const isNowSignedIn = !!user;
      
      if (wasSignedIn !== isNowSignedIn) {
        console.log('🔥 Firebase auth state changed:', isNowSignedIn ? 'signed in' : 'signed out');
        setIsFirebaseSignedIn(isNowSignedIn);
      }
    });

    return () => unsubscribe();
  }, [isFirebaseEnabled, isFirebaseSignedIn]);

  return {
    // Firebase auth state
    isFirebaseSignedIn,
    isFirebaseLoading,
    firebaseError,
    
    // Clerk auth state (for convenience)
    isClerkSignedIn: isSignedIn,
    clerkUserId: userId,
    isClerkLoaded: isLoaded,
    
    // Integration state
    isFirebaseEnabled,
    isFullyAuthenticated: isSignedIn && (isFirebaseSignedIn || !isFirebaseEnabled),
    
    // Actions
    retryFirebaseAuth,
    signOutFromFirebase,
    
    // Status
    retryCount,
    maxRetries: MAX_RETRIES,
  };
}
