'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { getFirebaseInstances, isFirebaseEnabled } from '@/lib/firebase-safe';
import { signInWithCustomToken } from 'firebase/auth';

/**
 * Comprehensive Integration Test Page
 * Tests each step of the Clerk-Firebase integration process
 */
export default function IntegrationTestPage() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (step: string, status: 'success' | 'error' | 'info', message: string, data?: any) => {
    const result = {
      step,
      status,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    console.log(`🧪 [TEST] ${step}: ${status.toUpperCase()} - ${message}`, data || '');
    setTestResults(prev => [...prev, result]);
  };

  const runIntegrationTest = async () => {
    setIsRunning(true);
    setTestResults([]);

    try {
      // Step 1: Check Clerk Authentication
      addResult('1. Clerk Auth Check', 'info', 'Checking Clerk authentication state...');
      
      if (!isLoaded) {
        addResult('1. Clerk Auth Check', 'error', 'Clerk not loaded yet');
        return;
      }

      if (!isSignedIn || !userId) {
        addResult('1. Clerk Auth Check', 'error', 'User not signed in with Clerk', { isSignedIn, userId });
        return;
      }

      addResult('1. Clerk Auth Check', 'success', 'Clerk authentication verified', { userId });

      // Step 2: Check Firebase Configuration
      addResult('2. Firebase Config', 'info', 'Checking Firebase configuration...');
      
      if (!isFirebaseEnabled) {
        addResult('2. Firebase Config', 'error', 'Firebase integration disabled');
        return;
      }

      addResult('2. Firebase Config', 'success', 'Firebase integration enabled');

      // Step 3: Initialize Firebase Instances
      addResult('3. Firebase Init', 'info', 'Initializing Firebase instances...');
      
      const { auth, app, db } = getFirebaseInstances();
      
      if (!app) {
        addResult('3. Firebase Init', 'error', 'Firebase app not initialized');
        return;
      }

      if (!auth) {
        addResult('3. Firebase Init', 'error', 'Firebase auth not initialized');
        return;
      }

      addResult('3. Firebase Init', 'success', 'Firebase instances initialized', {
        app: !!app,
        auth: !!auth,
        db: !!db,
        currentUser: auth.currentUser?.uid || 'none'
      });

      // Step 4: Get Firebase Token from Clerk
      addResult('4. Clerk Token', 'info', 'Getting Firebase token from Clerk...');
      
      const tokenStartTime = Date.now();
      let token;
      
      try {
        token = await getToken({ template: 'integration_firebase' });
        const tokenEndTime = Date.now();
        
        if (!token) {
          addResult('4. Clerk Token', 'error', 'Token is null/undefined');
          return;
        }

        addResult('4. Clerk Token', 'success', `Token received in ${tokenEndTime - tokenStartTime}ms`, {
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 20) + '...',
          tokenSuffix: '...' + token.substring(token.length - 20)
        });
      } catch (error) {
        addResult('4. Clerk Token', 'error', `Token request failed: ${error.message}`, error);
        return;
      }

      // Step 5: Sign in to Firebase
      addResult('5. Firebase Auth', 'info', 'Signing into Firebase with custom token...');
      
      const firebaseStartTime = Date.now();
      
      try {
        const userCredentials = await signInWithCustomToken(auth, token);
        const firebaseEndTime = Date.now();
        
        addResult('5. Firebase Auth', 'success', `Firebase sign-in completed in ${firebaseEndTime - firebaseStartTime}ms`, {
          uid: userCredentials.user.uid,
          email: userCredentials.user.email,
          providerId: userCredentials.user.providerId,
          isAnonymous: userCredentials.user.isAnonymous
        });
      } catch (error) {
        addResult('5. Firebase Auth', 'error', `Firebase sign-in failed: ${error.message}`, error);
        return;
      }

      // Step 6: Test Firestore Access
      if (db) {
        addResult('6. Firestore Test', 'info', 'Testing Firestore access...');
        
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const testDoc = doc(db, 'test', 'integration-test');
          const docSnap = await getDoc(testDoc);
          
          addResult('6. Firestore Test', 'success', 'Firestore access successful', {
            exists: docSnap.exists(),
            data: docSnap.exists() ? docSnap.data() : null
          });
        } catch (error) {
          addResult('6. Firestore Test', 'error', `Firestore access failed: ${error.message}`, error);
        }
      }

      addResult('COMPLETE', 'success', '🎉 Integration test completed successfully!');

    } catch (error) {
      addResult('FATAL ERROR', 'error', `Test failed with fatal error: ${error.message}`, error);
    } finally {
      setIsRunning(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🧪 Clerk-Firebase Integration Test</h1>
        
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
          <div className="space-x-4">
            <button 
              onClick={runIntegrationTest}
              disabled={isRunning}
              className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? 'Running Test...' : 'Run Integration Test'}
            </button>
            
            <button 
              onClick={clearResults}
              disabled={isRunning}
              className="bg-secondary text-secondary-foreground px-4 py-2 rounded hover:bg-secondary/90 disabled:opacity-50"
            >
              Clear Results
            </button>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          
          {testResults.length === 0 ? (
            <p className="text-muted-foreground">No test results yet. Click "Run Integration Test" to start.</p>
          ) : (
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded border-l-4 ${
                    result.status === 'success' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                    result.status === 'error' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' :
                    'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${
                      result.status === 'success' ? 'text-green-700 dark:text-green-300' :
                      result.status === 'error' ? 'text-red-700 dark:text-red-300' :
                      'text-blue-700 dark:text-blue-300'
                    }`}>
                      {result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : 'ℹ️'} {result.step}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm">{result.message}</p>
                  {result.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Show Details</summary>
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
