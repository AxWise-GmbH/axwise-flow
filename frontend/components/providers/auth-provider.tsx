'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useClerkFirebaseAuth } from '@/hooks/useClerkFirebaseAuth';

/**
 * Authentication context that provides both Clerk and Firebase auth state
 */
interface AuthContextType {
  // Firebase auth state
  isFirebaseSignedIn: boolean;
  isFirebaseLoading: boolean;
  firebaseError: string | null;

  // Clerk auth state
  isClerkSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  isClerkLoaded: boolean;

  // Integration state
  isFirebaseEnabled: boolean;
  isFullyAuthenticated: boolean | undefined;

  // Actions
  retryFirebaseAuth: () => Promise<boolean>;
  signOutFromFirebase: () => Promise<void>;

  // Status
  retryCount: number;
  maxRetries: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Authentication Provider that manages both Clerk and Firebase authentication
 * This provider should wrap the entire application to ensure automatic
 * Firebase authentication when users sign in with Clerk
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const authState = useClerkFirebaseAuth();

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use the authentication context
 * Provides access to both Clerk and Firebase auth state
 */
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

/**
 * Authentication Status Component
 * Shows the current authentication state with color-coded feedback
 */
export function AuthStatus() {
  const {
    isClerkSignedIn,
    isFirebaseSignedIn,
    isFirebaseLoading,
    firebaseError,
    isFirebaseEnabled,
    isFullyAuthenticated,
    retryFirebaseAuth,
    retryCount,
    maxRetries,
  } = useAuthContext();

  if (!isClerkSignedIn) {
    return null; // Don't show status if not signed in
  }

  return (
    <div className="fixed bottom-4 right-4 bg-card border rounded-lg p-3 shadow-lg max-w-sm z-50">
      <div className="text-xs space-y-1">
        <div className="font-semibold">Auth Status</div>
        <div className="flex items-center gap-2">
          <span>Clerk:</span>
          <span className={isClerkSignedIn ? 'text-green-600' : 'text-red-600'}>
            {isClerkSignedIn ? '✅' : '🔴'}
          </span>
        </div>
        {isFirebaseEnabled && (
          <div className="flex items-center gap-2">
            <span>Firebase:</span>
            {isFirebaseLoading ? (
              <span className="text-yellow-600">⏳</span>
            ) : (
              <span className={isFirebaseSignedIn ? 'text-green-600' : 'text-red-600'}>
                {isFirebaseSignedIn ? '✅' : '🔴'}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span>Ready:</span>
          <span className={isFullyAuthenticated ? 'text-green-600' : 'text-red-600'}>
            {isFullyAuthenticated ? '✅' : '🔴'}
          </span>
        </div>

        {firebaseError && (
          <div className="text-red-600 text-xs mt-2">
            <div>Error: {firebaseError}</div>
            {retryCount < maxRetries && (
              <button
                onClick={retryFirebaseAuth}
                className="text-blue-600 underline mt-1"
              >
                Retry ({retryCount}/{maxRetries})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
