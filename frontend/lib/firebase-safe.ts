'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Safe Firebase initialization utility
 * Prevents duplicate app initialization errors during build and SSR
 */

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Check if Firebase integration is enabled
export const isFirebaseEnabled = process.env.NEXT_PUBLIC_...=***REMOVED*** 'true';

// Firebase instances
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase safely
 * Only initializes on client-side and when Firebase is enabled
 */
export function initializeFirebaseSafe(): {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
} {
  // Only initialize on client-side
  if (typeof window === 'undefined') {
    return { app: null, auth: null, db: null };
  }

  // Only initialize if Firebase is enabled
  if (!isFirebaseEnabled) {
    return { app: null, auth: null, db: null };
  }

  try {
    // Check if Firebase app already exists to prevent duplicate initialization
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }

    // Initialize auth and firestore
    if (app && !auth) {
      auth = getAuth(app);
    }
    
    if (app && !db) {
      db = getFirestore(app);
    }

    return { app, auth, db };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return { app: null, auth: null, db: null };
  }
}

/**
 * Get Firebase instances (lazy initialization)
 */
export function getFirebaseInstances() {
  if (!app || !auth || !db) {
    return initializeFirebaseSafe();
  }
  return { app, auth, db };
}

/**
 * Check if Firebase is ready for use
 */
export function isFirebaseReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    isFirebaseEnabled &&
    app !== null &&
    auth !== null &&
    db !== null
  );
}

/**
 * Reset Firebase instances (useful for testing)
 */
export function resetFirebaseInstances(): void {
  app = null;
  auth = null;
  db = null;
}
