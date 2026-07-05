'use client';

import React, { createContext, useContext, ReactNode } from 'react';

interface AuthContextType {
  isClerkSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  isClerkLoaded: boolean;
  isFullyAuthenticated: boolean | undefined;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // OSS mode: no Clerk, treat user as authenticated for app features
  const authState: AuthContextType = {
    isClerkSignedIn: false,
    clerkUserId: null,
    isClerkLoaded: true,
    isFullyAuthenticated: true,
  };

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

export function AuthStatus() {
  return null;
}
