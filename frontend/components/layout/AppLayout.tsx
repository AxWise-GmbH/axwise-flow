'use client';

import { type PropsWithChildren, useEffect } from 'react';
import Header from './Header';
import { initializeAuth } from '@/lib/authUtils';
import { Toaster } from '@/components/ui/toaster';

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
      console.error('Failed to initialize authentication:', error);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className={`container mx-auto px-4 py-8 ${className}`}>
        {children}
      </main>
      <Toaster />
    </div>
  );
}

export default AppLayout;
