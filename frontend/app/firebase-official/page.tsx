'use client';

import { useAuth } from '@clerk/nextjs';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { getFirebaseInstances } from '@/lib/firebase-safe';

/**
 * Official Clerk-Firebase Integration Test Page
 * This page follows the exact pattern from Clerk's official documentation:
 * https://clerk.com/docs/integrations/databases/firebase
 */

// Firebase instances will be initialized safely using the utility

// Example Firestore operations (from official docs)
const getFirestoreData = async (): Promise<any> => {
  const { db } = getFirebaseInstances();
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const docRef = doc(db, 'example', 'example-document');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    console.log('Document data:', docSnap.data());
    return docSnap.data();
  } else {
    console.log('No such document!');
    return null;
  }
};

const setFirestoreData = async (data: any): Promise<void> => {
  const { db } = getFirebaseInstances();
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const docRef = doc(db, 'example', 'example-document');
  await setDoc(docRef, data);
  console.log('Document written successfully');
};

export default function FirebaseOfficialPage() {
  const { getToken, userId } = useAuth();
  const [isFirebaseSignedIn, setIsFirebaseSignedIn] = useState(false);
  const [firestoreData, setFirestoreData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Check if Firebase integration is enabled
  const isFirebaseEnabled = process.env.NEXT_PUBLIC_...=***REMOVED*** 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  // Ensure we're on the client side before rendering Firebase components
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle if the user is not signed in
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">You need to sign in with Clerk to access this page.</p>
          <a href="/sign-in" className="text-primary hover:underline">
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  // Official Clerk-Firebase integration method (from docs)
  const signIntoFirebaseWithClerk = async (): Promise<void> => {
    if (!isClient) {
      setError('Client-side rendering required for Firebase operations');
      return;
    }

    if (!isFirebaseEnabled) {
      setError('Firebase integration is disabled in this environment');
      return;
    }

    const { auth } = getFirebaseInstances();
    if (!auth) {
      setError('Firebase auth not initialized');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get Firebase token from Clerk using the official integration template
      const token = await getToken({ template: 'integration_firebase' });

      if (!token) {
        throw new Error('Failed to get Firebase token from Clerk');
      }

      // Sign in to Firebase with the custom token
      const userCredentials = await signInWithCustomToken(auth, token);

      // The userCredentials.user object can call the methods of
      // the Firebase platform as an authenticated user.
      console.log('User:', userCredentials.user);
      setIsFirebaseSignedIn(true);
    } catch (err) {
      console.error('Error signing into Firebase:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign into Firebase');
    } finally {
      setIsLoading(false);
    }
  };

  // Test Firestore read operation
  const testFirestoreRead = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getFirestoreData();
      setFirestoreData(data);
    } catch (err) {
      console.error('Error reading from Firestore:', err);
      setError(err instanceof Error ? err.message : 'Failed to read from Firestore');
    } finally {
      setIsLoading(false);
    }
  };

  // Test Firestore write operation
  const testFirestoreWrite = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const testData = {
        message: 'Hello from Official Clerk + Firebase Integration!',
        timestamp: new Date().toISOString(),
        userId: userId,
        method: 'Official Clerk Documentation Pattern'
      };
      await setFirestoreData(testData);
      setFirestoreData(testData);
    } catch (err) {
      console.error('Error writing to Firestore:', err);
      setError(err instanceof Error ? err.message : 'Failed to write to Firestore');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state during hydration
  if (!isClient) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Official Clerk-Firebase Integration</h1>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Official Clerk-Firebase Integration</h1>

        <div className={`border p-4 rounded-lg mb-6 ${isFirebaseEnabled ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <h2 className={`text-lg font-semibold mb-2 ${isFirebaseEnabled ? 'text-green-800' : 'text-yellow-800'}`}>
            {isFirebaseEnabled ? '🔥 Firebase Integration Enabled' : '⚠️ Development Mode - Clerk Only'}
          </h2>
          <p className={isFirebaseEnabled ? 'text-green-700' : 'text-yellow-700'}>
            <strong>Environment:</strong> {isProduction ? 'Production' : 'Development'}<br/>
            <strong>Firebase Integration:</strong> {isFirebaseEnabled ? 'Enabled (Full Clerk + Firebase)' : 'Disabled (Clerk authentication only)'}<br/>
            {isFirebaseEnabled ?
              'This page uses the official Clerk-Firebase integration pattern.' :
              'Firebase features are disabled in development. Only Clerk authentication is active.'
            }
          </p>
        </div>

        <div className="grid gap-6">
          {/* Authentication Status */}
          <div className="bg-card p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
            <div className="space-y-2">
              <p><strong>Clerk User ID:</strong> {userId}</p>
              <p><strong>Firebase Signed In:</strong> {isFirebaseSignedIn ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Loading:</strong> {isLoading ? '⏳ Yes' : '✅ No'}</p>
              {error && <p className="text-destructive"><strong>Error:</strong> {error}</p>}
            </div>
          </div>

          {/* Firebase Authentication */}
          <div className="bg-card p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">Firebase Authentication</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Uses: <code>getToken(&#123; template: 'integration_firebase' &#125;)</code>
            </p>
            <button
              onClick={signIntoFirebaseWithClerk}
              disabled={isLoading || isFirebaseSignedIn}
              className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : isFirebaseSignedIn ? 'Already signed in' : 'Sign into Firebase'}
            </button>
          </div>

          {/* Firestore Operations */}
          <div className="bg-card p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">Firestore Operations</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Test reading and writing to Firestore with authenticated Firebase user.
            </p>

            <div className="space-x-4 mb-4">
              <button
                onClick={testFirestoreRead}
                disabled={isLoading || !isFirebaseSignedIn}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded hover:bg-secondary/90 disabled:opacity-50"
              >
                Read Document
              </button>

              <button
                onClick={testFirestoreWrite}
                disabled={isLoading || !isFirebaseSignedIn}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded hover:bg-secondary/90 disabled:opacity-50"
              >
                Write Document
              </button>
            </div>

            {firestoreData && (
              <div className="bg-muted p-4 rounded">
                <h3 className="font-semibold mb-2">Firestore Data:</h3>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(firestoreData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="bg-card p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Environment:</strong> {process.env.NODE_ENV}</p>
              <p><strong>Firebase Project ID:</strong> {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</p>
              <p><strong>Clerk Domain:</strong> {process.env.NEXT_PUBLIC_CLERK_DOMAIN}</p>
              <p><strong>Integration Method:</strong> Official Clerk Documentation</p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center space-x-4">
          <a href="/test-clerk" className="text-primary hover:underline">
            Test Clerk Only
          </a>
          <a href="/unified-dashboard" className="text-primary hover:underline">
            Go to Dashboard
          </a>
          <a href="https://clerk.com/docs/integrations/databases/firebase" target="_blank" className="text-primary hover:underline">
            View Official Docs
          </a>
        </div>
      </div>
    </div>
  );
}
