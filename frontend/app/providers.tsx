'use client';

import { type ReactNode } from 'react';
// import { ThemeProvider } from '@/components/providers/theme-provider';
// import { ToastProvider } from '@/components/providers/toast-provider';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Providers component wraps the application with all necessary context providers
 * This ensures consistent access to theme, toast notifications, and other app-wide
 * functionality throughout the component tree.
 * 
 * Note: ThemeProvider and ToastProvider temporarily removed for debugging
 */
export function Providers({ children }: ProvidersProps): JSX.Element {
  return (
    // <ThemeProvider
    //   attribute="class"
    //   defaultTheme="system"
    //   enableSystem
    //   disableTransitionOnChange
    // >
    //   <ToastProvider defaultPosition="top-right" defaultDuration={5000}>
        <>{children}</>
    //   </ToastProvider>
    // </ThemeProvider>
  );
}

export default Providers;