'use client';

import { useFirebaseAuthContext } from '@/components/providers/firebase-auth-provider';

/**
 * Component to display the Firebase authentication status
 * This is useful for debugging and testing the Firebase authentication integration
 */
export function FirebaseAuthStatus() {
  const { firebaseUser, isLoading, error } = useFirebaseAuthContext();

  if (isLoading) {
    return <div className="p-4 bg-yellow-100 text-yellow-800 rounded">Loading Firebase auth state...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded">
        <h3 className="font-bold">Firebase Auth Error</h3>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return <div className="p-4 bg-gray-100 text-gray-800 rounded">Not signed in to Firebase</div>;
  }

  return (
    <div className="p-4 bg-green-100 text-green-800 rounded">
      <h3 className="font-bold">Firebase Auth Status</h3>
      <p>Signed in as: {firebaseUser.uid}</p>
      <p>Email: {firebaseUser.email || 'No email'}</p>
      <p>Display Name: {firebaseUser.displayName || 'No display name'}</p>
    </div>
  );
}
