'use client';

import { FirebaseAuthStatus } from '@/components/firebase-auth-status';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

/**
 * Test page for Firebase authentication
 * This page displays the status of both Clerk and Firebase authentication
 */
export default function FirebaseTestPage() {
  const { isSignedIn, userId } = useAuth();

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Firebase Authentication Test</h1>
      
      <div className="grid gap-6">
        <div className="p-4 bg-blue-100 text-blue-800 rounded">
          <h2 className="text-xl font-bold mb-2">Clerk Authentication Status</h2>
          {isSignedIn ? (
            <div>
              <p>Signed in to Clerk</p>
              <p>User ID: {userId}</p>
            </div>
          ) : (
            <p>Not signed in to Clerk</p>
          )}
        </div>
        
        <FirebaseAuthStatus />
        
        <div className="mt-6">
          <Link 
            href="/unified-dashboard" 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
