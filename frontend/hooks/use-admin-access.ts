'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to check if the current user has admin access
 * Checks for admin role in Clerk user metadata
 */
export function useAdminAccess(): { isAdmin: boolean; isLoading: boolean; user: any; userId: string } {
  // OSS mode: no Clerk; treat localhost as admin for debug tools
  const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const userId = 'oss-mode-user';
  const user: any = undefined;

  return {
    isAdmin: isDevelopment,
    isLoading: false,
    user,
    userId
  };
}

/**
 * Admin access levels
 */
export enum AdminLevel {
  NONE = 'none',
  VIEWER = 'viewer',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

/**
 * Get admin access level for current user
 */
export function useAdminLevel() {
  const { isAdmin } = useAdminAccess();
  return isAdmin ? AdminLevel.SUPER_ADMIN : AdminLevel.NONE;
}
