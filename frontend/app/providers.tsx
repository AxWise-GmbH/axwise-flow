'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { ClerkProvider } from '@clerk/nextjs';

import { getClerkProviderConfig } from '@/lib/clerk-config';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Providers component wraps the application with all necessary context providers
 * Simplified configuration for Firebase App Hosting deployment
 */
export function Providers({ children }: ProvidersProps): JSX.Element {
  // Get Clerk configuration
  const clerkConfig = getClerkProviderConfig();
  const isClerkConfigured = clerkConfig.publishableKey &&
    clerkConfig.publishableKey !== '' &&
    !clerkConfig.publishableKey.includes('placeholder') &&
    !clerkConfig.publishableKey.includes('disabled');

  console.log('Clerk Configuration:', {
    publishableKey: clerkConfig.publishableKey,
    isConfigured: isClerkConfigured,
    environment: process.env.NODE_ENV
  });

  // Always render ClerkProvider if we have a valid publishable key
  if (isClerkConfigured) {
    return (
      <ClerkProvider {...clerkConfig}>
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ToastProvider defaultPosition="top-right" defaultDuration={5000}>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </ClerkProvider>
    );
  }

  // Fallback without Clerk (should not happen in development with proper config)
  console.warn('Clerk not configured - falling back to no authentication');
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ToastProvider defaultPosition="top-right" defaultDuration={5000}>
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}

export default Providers;
