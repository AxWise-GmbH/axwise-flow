'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { ClerkProvider } from '@clerk/nextjs';
import { FirebaseClerkProvider } from '@/components/providers/firebase-clerk-provider';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Providers component wraps the application with all necessary context providers
 * This ensures consistent access to theme, toast notifications, and other app-wide
 * functionality throughout the component tree.
 *
 */
export function Providers({ children }: ProvidersProps): JSX.Element {
  // Check if Clerk keys are available
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isClerkConfigured = clerkPublishableKey && clerkPublishableKey !== 'your_clerk_publishable_key_here';

  // If Clerk is not configured, render without ClerkProvider
  if (!isClerkConfigured) {
    console.warn('Clerk authentication is not configured. Running in development mode without authentication.');
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

  // If Clerk is configured, use ClerkProvider with FirebaseClerkProvider
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
    >
      <FirebaseClerkProvider>
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
      </FirebaseClerkProvider>
    </ClerkProvider>
  );
}

export default Providers;
