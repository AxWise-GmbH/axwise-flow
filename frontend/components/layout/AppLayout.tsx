'use client';

import { type PropsWithChildren } from 'react';
import Header from './Header';

interface AppLayoutProps extends PropsWithChildren {
  className?: string;
}

/**
 * Main application layout wrapper
 * Provides consistent layout structure and theme support
 */
export function AppLayout({ children, className = '' }: AppLayoutProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className={`container mx-auto px-4 py-8 ${className}`}>
        {children}
      </main>
    </div>
  );
}

export default AppLayout;