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
    console.log('🔥 [CLERK-FIREBASE] Starting authentication process...', {
      isFirebaseEnabled,
      isSignedIn,
      userId,
      isLoaded,
      isFirebaseSignedIn,
      forceRetry
    });

    // Only proceed if Firebase is enabled and user is signed in with Clerk
    if (!isFirebaseEnabled) {
      console.log('🔥 [CLERK-FIREBASE] Firebase integration disabled');
      return false;
    }

    if (!isSignedIn || !userId || !isLoaded) {
      console.log('🔥 [CLERK-FIREBASE] Clerk not ready:', { isSignedIn, userId, isLoaded });
      return false;
    }

    // Skip if already authenticated and not forcing retry
    if (isFirebaseSignedIn && !forceRetry) {
      console.log('🔥 [CLERK-FIREBASE] Already authenticated, skipping');
      return true;
    }

    console.log('🔥 [CLERK-FIREBASE] Proceeding with Firebase authentication...');
    setIsFirebaseLoading(true);
    setFirebaseError(null);

    try {
      // Step 1: Get Firebase instances
      console.log('🔥 [CLERK-FIREBASE] Step 1: Getting Firebase instances...');
      const { auth, app } = getFirebaseInstances();

      if (!app) {
        throw new Error('Firebase app not initialized');
      }

      if (!auth) {
        throw new Error('Firebase auth not initialized');
      }

      console.log('🔥 [CLERK-FIREBASE] Firebase instances ready:', {
        app: !!app,
        auth: !!auth,
        authCurrentUser: auth.currentUser?.uid || 'none'
      });

      // Step 2: Get Firebase token from Clerk
      console.log('🔥 [CLERK-FIREBASE] Step 2: Getting Firebase token from Clerk...');
      console.log('🔥 [CLERK-FIREBASE] Calling getToken({ template: "integration_firebase" })...');

      const tokenStartTime = Date.now();
      const token = await getToken({ template: 'integration_firebase' });
      const tokenEndTime = Date.now();

      console.log('🔥 [CLERK-FIREBASE] Token request completed in', tokenEndTime - tokenStartTime, 'ms');

      if (!token) {
        throw new Error('Failed to get Firebase token from Clerk - token is null/undefined');
      }

      console.log('🔥 [CLERK-FIREBASE] Token received:', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
        tokenSuffix: '...' + token.substring(token.length - 20)
      });

      // Step 3: Sign in to Firebase with custom token
      console.log('🔥 [CLERK-FIREBASE] Step 3: Signing into Firebase with custom token...');

      const firebaseStartTime = Date.now();
      const userCredentials = await signInWithCustomToken(auth, token);
      const firebaseEndTime = Date.now();

      console.log('🔥 [CLERK-FIREBASE] Firebase sign-in completed in', firebaseEndTime - firebaseStartTime, 'ms');
      console.log('🔥 [CLERK-FIREBASE] Firebase authentication successful!', {
        uid: userCredentials.user.uid,
        email: userCredentials.user.email,
        providerId: userCredentials.user.providerId,
        isAnonymous: userCredentials.user.isAnonymous
      });

      setIsFirebaseSignedIn(true);
      setRetryCount(0); // Reset retry count on success

      console.log('🔥 [CLERK-FIREBASE] ✅ INTEGRATION COMPLETE - User authenticated with both Clerk and Firebase');
      return true;

    } catch (error) {
      console.error('🔥 [CLERK-FIREBASE] ❌ Authentication error:', error);
      console.error('🔥 [CLERK-FIREBASE] Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });

      const errorMessage = error instanceof Error ? error.message : 'Failed to authenticate with Firebase';
      setFirebaseError(errorMessage);

      // Retry logic for transient errors
      if (retryCount < MAX_RETRIES && !forceRetry) {
        console.log(`🔥 [CLERK-FIREBASE] Retrying Firebase authentication (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY}ms...`);
        setRetryCount(prev => prev + 1);

        setTimeout(() => {
          authenticateWithFirebase(false);
        }, RETRY_DELAY);
      } else {
        console.error(`🔥 [CLERK-FIREBASE] Max retries reached or forced retry failed. Giving up.`);
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
    if (!isFirebaseEnabled) {
      console.log('🔥 [FIREBASE-MONITOR] Firebase integration disabled, skipping auth state monitoring');
      return;
    }

    const { auth } = getFirebaseInstances();
    if (!auth) {
      console.log('🔥 [FIREBASE-MONITOR] Firebase auth not available, skipping monitoring');
      return;
    }

    console.log('🔥 [FIREBASE-MONITOR] Setting up Firebase auth state monitoring...');

    const unsubscribe = auth.onAuthStateChanged((user) => {
      const wasSignedIn = isFirebaseSignedIn;
      const isNowSignedIn = !!user;

      console.log('🔥 [FIREBASE-MONITOR] Firebase auth state changed:', {
        wasSignedIn,
        isNowSignedIn,
        user: user ? {
          uid: user.uid,
          email: user.email,
          providerId: user.providerId,
          isAnonymous: user.isAnonymous,
          emailVerified: user.emailVerified
        } : null
      });

      if (wasSignedIn !== isNowSignedIn) {
        console.log('🔥 [FIREBASE-MONITOR] Updating Firebase signed-in state:', isNowSignedIn ? 'signed in' : 'signed out');
        setIsFirebaseSignedIn(isNowSignedIn);
      }
    });

    return () => {
      console.log('🔥 [FIREBASE-MONITOR] Cleaning up Firebase auth state monitoring');
      unsubscribe();
    };
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
