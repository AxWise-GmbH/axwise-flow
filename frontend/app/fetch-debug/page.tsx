'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

/**
 * Fetch Error Diagnostic Page
 * Tests API calls and identifies fetch errors
 */
export default function FetchDebugPage() {
  const { getToken, userId, isSignedIn } = useAuth();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (test: string, status: 'success' | 'error' | 'info', message: string, data?: any) => {
    const result = {
      test,
      status,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    console.log(`🌐 [FETCH-TEST] ${test}: ${status.toUpperCase()} - ${message}`, data || '');
    setTestResults(prev => [...prev, result]);
  };

  const testFetch = async (url: string, options: RequestInit = {}) => {
    const startTime = Date.now();
    try {
      const response = await fetch(url, options);
      const endTime = Date.now();
      
      const result = {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        duration: endTime - startTime
      };

      if (response.ok) {
        try {
          const data = await response.text();
          result.data = data.length > 500 ? data.substring(0, 500) + '...' : data;
        } catch (e) {
          result.data = 'Could not read response body';
        }
      } else {
        try {
          const errorData = await response.text();
          result.error = errorData;
        } catch (e) {
          result.error = 'Could not read error response';
        }
      }

      return result;
    } catch (error) {
      const endTime = Date.now();
      return {
        url,
        status: 0,
        statusText: 'Network Error',
        ok: false,
        error: error.message,
        duration: endTime - startTime,
        networkError: true
      };
    }
  };

  const runFetchTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    // Test 1: Basic connectivity
    addResult('1. Basic Connectivity', 'info', 'Testing basic internet connectivity...');
    const googleTest = await testFetch('https://www.google.com');
    if (googleTest.ok) {
      addResult('1. Basic Connectivity', 'success', 'Internet connectivity working');
    } else {
      addResult('1. Basic Connectivity', 'error', 'Internet connectivity issues', googleTest);
    }

    // Test 2: Same-origin API calls
    addResult('2. Same-Origin API', 'info', 'Testing same-origin API calls...');
    const apiTest = await testFetch('/api/health');
    if (apiTest.ok) {
      addResult('2. Same-Origin API', 'success', `API accessible (${apiTest.status})`, apiTest);
    } else {
      addResult('2. Same-Origin API', 'error', `API call failed (${apiTest.status})`, apiTest);
    }

    // Test 3: Backend API (if different origin)
    addResult('3. Backend API', 'info', 'Testing backend API calls...');
    const backendTest = await testFetch('http://localhost:8000/health');
    if (backendTest.ok) {
      addResult('3. Backend API', 'success', `Backend accessible (${backendTest.status})`, backendTest);
    } else {
      addResult('3. Backend API', 'error', `Backend call failed (${backendTest.status})`, backendTest);
    }

    // Test 4: Authenticated API calls
    if (isSignedIn) {
      addResult('4. Authenticated API', 'info', 'Testing authenticated API calls...');
      
      try {
        const token = await getToken();
        const authTest = await testFetch('/api/protected', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (authTest.ok) {
          addResult('4. Authenticated API', 'success', `Authenticated call successful (${authTest.status})`, authTest);
        } else {
          addResult('4. Authenticated API', 'error', `Authenticated call failed (${authTest.status})`, authTest);
        }
      } catch (error) {
        addResult('4. Authenticated API', 'error', `Token error: ${error.message}`, error);
      }
    } else {
      addResult('4. Authenticated API', 'error', 'User not signed in, skipping authenticated tests');
    }

    // Test 5: File upload simulation
    addResult('5. File Upload Test', 'info', 'Testing file upload endpoint...');
    const formData = new FormData();
    formData.append('test', 'true');
    
    const uploadTest = await testFetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (uploadTest.ok) {
      addResult('5. File Upload Test', 'success', `Upload endpoint accessible (${uploadTest.status})`, uploadTest);
    } else {
      addResult('5. File Upload Test', 'error', `Upload endpoint failed (${uploadTest.status})`, uploadTest);
    }

    // Test 6: CORS test
    addResult('6. CORS Test', 'info', 'Testing CORS configuration...');
    const corsTest = await testFetch('https://httpbin.org/get');
    if (corsTest.ok) {
      addResult('6. CORS Test', 'success', 'External API calls working');
    } else {
      addResult('6. CORS Test', 'error', 'CORS or external API issues', corsTest);
    }

    setIsRunning(false);
    addResult('COMPLETE', 'success', '🎉 Fetch diagnostic completed!');
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🌐 Fetch Error Diagnostic</h1>
        
        <div className="bg-card p-6 rounded-lg border mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
          <div className="space-x-4">
            <button 
              onClick={runFetchTests}
              disabled={isRunning}
              className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? 'Running Tests...' : 'Run Fetch Tests'}
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
            <p className="text-muted-foreground">No test results yet. Click "Run Fetch Tests" to start.</p>
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
                      {result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : 'ℹ️'} {result.test}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm">{result.message}</p>
                  {result.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Show Details</summary>
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-40">
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
