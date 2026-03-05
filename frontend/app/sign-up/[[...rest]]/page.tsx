'use client';

import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { isClerkConfigured } from '@/lib/clerk-config';
import { useState, useEffect } from 'react';

export default function SignUpPage(): JSX.Element {
  const [isClient, setIsClient] = useState(false);
  const [clerkConfigured, setClerkConfigured] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setClerkConfigured(isClerkConfigured());
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
          <h1 className="text-3xl font-bold">Create an Account</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Sign up to start analyzing interview data with AI
          </p>
        </div>
        <div className="mt-8">
          {!isClient ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading authentication...</p>
            </div>
          ) : (
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/sign-in"
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

        {/* Navigation to Sign In */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
