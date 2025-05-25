'use client';

import { ReactNode } from 'react';
import { AuthStatus } from '@/components/providers/auth-provider';

interface DashboardWithAuthProps {
  children: ReactNode;
}

/**
 * Client-side wrapper for dashboard pages that includes authentication status
 * This component shows the authentication state for debugging and monitoring
 */
export function DashboardWithAuth({ children }: DashboardWithAuthProps) {
  return (
    <>
      {children}
      <AuthStatus />
    </>
  );
}
