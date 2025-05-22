'use client';

import { createContext, useContext, ReactNode } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { useFirebaseAuth } from '@/lib/auth-sync';

// Define the context type
interface FirebaseAuthContextType {
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  error: Error | null;
}

// Create the context with default values
const FirebaseAuthContext = createContext<FirebaseAuthContextType>({
  firebaseUser: null,
  isLoading: true,
  error: null,
});

// Hook to use the Firebase Auth context
export const useFirebaseAuthContext = () => useContext(FirebaseAuthContext);

interface FirebaseAuthProviderProps {
  children: ReactNode;
}

/**
 * Firebase Auth Provider component
 * This component provides Firebase authentication state to the application
 * It synchronizes the authentication state between Clerk and Firebase
 */
export function FirebaseAuthProvider({ children }: FirebaseAuthProviderProps): JSX.Element {
  // Use the custom hook to get Firebase auth state
  const { firebaseUser, isLoading, error } = useFirebaseAuth();

  // Provide the auth state to the application
  return (
    <FirebaseAuthContext.Provider value={{ firebaseUser, isLoading, error }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}
