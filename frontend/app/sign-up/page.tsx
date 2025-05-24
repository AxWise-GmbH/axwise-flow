import { SignUp } from '@clerk/nextjs';
import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { AuthErrorBoundary } from '@/components/auth-error-boundary';

export const metadata: Metadata = {
  title: 'Sign Up | Interview Insight Analyst',
  description: 'Create a new Interview Insight Analyst account',
};

export default function SignUpPage(): JSX.Element { // Add return type
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create an Account</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign up to start analyzing interview data with AI
          </p>
        </div>
        <div className="mt-8">
          <AuthErrorBoundary>
            <Suspense fallback={<LoadingSpinner label="Loading sign-up..." />}>
              <SignUp
                routing="path"
                path="/sign-up"
                signInUrl="/sign-in"
                appearance={{
                  elements: {
                    card: 'shadow-xl border-gray-200 dark:border-gray-800',
                    headerTitle: 'text-2xl font-semibold',
                    headerSubtitle: 'text-gray-500 dark:text-gray-400',
                    formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
                  },
                }}
              />
            </Suspense>
          </AuthErrorBoundary>
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
