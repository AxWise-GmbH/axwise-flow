'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function SignInPage(): JSX.Element {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome Back</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to access your Interview Insight Analyst dashboard
          </p>
        </div>
        <div className="mt-8">
          {/* Debug: Show if we're in client mode */}
          {!isClient ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading authentication...</p>
            </div>
          ) : (
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
              appearance={{
                elements: {
                  card: 'shadow-xl border-gray-200 dark:border-gray-800',
                  headerTitle: 'text-2xl font-semibold',
                  headerSubtitle: 'text-gray-500 dark:text-gray-400',
                  formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
                },
              }}
            />
          )}
        </div>

        {/* Navigation to Sign Up */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link
              href="/sign-up"
              className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              Sign up here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
