'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

/**
 * Hook to check if the current user has admin access
 * Checks for admin role in Clerk user metadata
 */
export function useAdminAccess() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) {
      setIsLoading(false);
      setIsAdmin(false);
      return;
    }

    // Check for admin role in user metadata
    const userRole = user.publicMetadata?.role as string;
    const isUserAdmin = userRole === 'admin' || userRole === 'super_admin';

    // Also check for admin email domains (fallback)
    const adminEmails = [
      'vitalijs@axwise.de',
      'admin@axwise.de'
    ];
    const userEmail = user.primaryEmailAddress?.emailAddress;
    const emailIsAdmin = userEmail && adminEmails.includes(userEmail);

    // Debug logging
    console.log('🔍 Admin Access Debug:', {
      userEmail,
      userRole,
      isUserAdmin,
      emailIsAdmin,
      adminEmails,
      finalIsAdmin: isUserAdmin || emailIsAdmin || false
    });

    setIsAdmin(isUserAdmin || emailIsAdmin || false);
    setIsLoading(false);
  }, [isLoaded, user]);

  return {
    isAdmin,
    isLoading,
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
  const { isAdmin, user } = useAdminAccess();

  if (!isAdmin || !user) return AdminLevel.NONE;

  const userRole = user.publicMetadata?.role as string;

  switch (userRole) {
    case 'super_admin':
      return AdminLevel.SUPER_ADMIN;
    case 'admin':
      return AdminLevel.ADMIN;
    case 'viewer':
      return AdminLevel.VIEWER;
    default:
      // Check for admin email domains
      const adminEmails = ['vitalijs@axwise.de', 'admin@axwise.de'];
      const emailIsAdmin = user.primaryEmailAddress?.emailAddress &&
        adminEmails.includes(user.primaryEmailAddress.emailAddress);

      return emailIsAdmin ? AdminLevel.SUPER_ADMIN : AdminLevel.NONE;
  }
}
