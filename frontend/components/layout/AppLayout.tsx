'use client';

import { type PropsWithChildren, useEffect } from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  // Initialize authentication on component mount
  useEffect(() => {
    initializeAuth().catch(error => {
      console.error('Failed to initialize authentication - please check your credentials');
    });
  }, []);

  // Check if this is the marketing landing page (homepage)
  const isMarketingPage = pathname === '/';

  // Check if this is a full-screen page (no header/footer/container)
  const isFullScreenPage = pathname?.startsWith('/precall');

  // Full-screen pages render without the standard layout
  if (isFullScreenPage) {
    return (
      <div className="min-h-screen bg-background">
        {children}
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className={`flex-grow ${isMarketingPage ? '' : 'container mx-auto px-4 py-8'} ${className}`}>
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
