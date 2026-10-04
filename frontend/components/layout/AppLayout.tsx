'use client';

import { type PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import { Footer } from './Footer';
import { Toaster } from '@/components/ui/toaster';
import CookieConsentBanner from '@/components/cookie-consent';

interface AppLayoutProps extends PropsWithChildren {
  className?: string;
}

/**
 * Main application layout wrapper
 * Provides consistent layout structure and theme support
 */
export function AppLayout({ children, className = '' }: AppLayoutProps): JSX.Element {
  const pathname = usePathname();

  // Pages that embed their own dedicated landing header & footer
  const isMarketingPage = pathname === '/' || pathname === '/privacy-policy' || pathname === '/terms-of-service' || pathname === '/impressum' || pathname === '/docs';

  // Check if this is a full-screen page (no header/footer/container)
  const isFullScreenPage = pathname?.startsWith('/precall');

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
      {!isMarketingPage && <Header />}
      <main className={`flex-grow ${isMarketingPage ? '' : 'container mx-auto px-4 py-8'} ${className}`}>
        {children}
      </main>
      {!isMarketingPage && <Footer />}
      <Toaster />
      <CookieConsentBanner />
    </div>
  );
}

export default AppLayout;
