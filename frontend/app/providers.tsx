'use client';

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { UnifiedResearchProvider } from '@/lib/context/unified-research-context';
import { ClerkProvider } from '@clerk/nextjs';
import { getClerkProviderConfig } from '@/lib/clerk-config';

const queryClient = new QueryClient();

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): JSX.Element {
  const clerkConfig = getClerkProviderConfig();
  const isClerkConfigured = clerkConfig.publishableKey &&
    clerkConfig.publishableKey !== '' &&
    !clerkConfig.publishableKey.includes('placeholder') &&
    !clerkConfig.publishableKey.includes('disabled');

  const content = (
    <AuthProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ToastProvider defaultPosition="top-right" defaultDuration={5000}>
          <UnifiedResearchProvider>
            {children}
          </UnifiedResearchProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isClerkConfigured ? (
        <ClerkProvider
          publishableKey={clerkConfig.publishableKey}
          appearance={clerkConfig.appearance}
        >
          {content}
        </ClerkProvider>
      ) : content}
    </QueryClientProvider>
  );
}

export default Providers;
