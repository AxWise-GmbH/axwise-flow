import { SignUp } from '@clerk/nextjs';
import { Metadata } from 'next';
import Link from 'next/link';
import { isClerkConfigured } from '@/lib/clerk-config';

export const metadata: Metadata = {
  title: 'Sign Up - AxWise',
  description: 'Sign up to start analyzing interview data with AI',
};

export default function SignUpPage() {
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
          {isClerkConfigured ? (
            <SignUp
              routing="hash"
              appearance={{
                elements: {
                  card: 'shadow-xl border-gray-200 dark:border-gray-800',
                  headerTitle: 'text-2xl font-semibold',
                  headerSubtitle: 'text-gray-500 dark:text-gray-400',
                  formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
                },
              }}
            />
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Development Mode
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <p>
                      Clerk authentication is not configured for localhost.
                      Production keys are restricted to axwise.de domain.
                    </p>
                    <p className="mt-2">
                      <Link
                        href="/unified-dashboard"
                        className="font-medium underline hover:no-underline"
                      >
                        Continue to Dashboard (Development Mode)
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation to Sign In */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
