'use client';

import { type PropsWithChildren, useEffect } from 'react';
import Header from './Header';
import Footer from './Footer';
import { initializeAuth } from '@/lib/authUtils';
import { Toaster } from '@/components/ui/toaster';
import CookieConsentBanner from '@/components/cookie-consent';
import { AuthStatus } from '@/components/providers/auth-provider';

interface AppLayoutProps extends PropsWithChildren {
  className?: string;
}

/**
 * Main application layout wrapper
 * Provides consistent layout structure and theme support
 */
export function AppLayout({ children, className = '' }: AppLayoutProps): JSX.Element {
  // Initialize authentication on component mount
  useEffect(() => {
    initializeAuth().catch(error => {
      console.error('Failed to initialize authentication - please check your credentials');
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className={`container mx-auto px-4 py-8 flex-grow ${className}`}>
        {children}
      </main>
      <Footer />
      <Toaster />
      <CookieConsentBanner />
      <AuthStatus />
    </div>
  );
}

export default AppLayout;
