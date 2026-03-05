/**
 * Authentication-related methods for the API client
 */

import { apiCore } from './core';

/**
 * Get an authentication token from Clerk if available
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.log('Server-side environment, no token available');
      return null;
    }

    // This assumes Clerk is loaded and available in the global window object
    if (window.Clerk?.session) {
      const token = await window.Clerk.session.getToken();
      if (token) {
        return token;
      }
    }

    // Fall back to DEV_AUTH_TOKEN if Clerk is disabled or unavailable
    const useClerk = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';
    if (!useClerk) {
      return process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
    }

    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Set the authentication token for API requests
 */
export function setAuthToken(token: string): void {
  if (!token) {
    return;
  }
  apiCore.setHeader('Authorization', `Bearer ${token}`);
}

/**
 * Clear the authentication token for API requests
 */
export function clearAuthToken(): void {
  apiCore.removeHeader('Authorization');
}

/**
 * Initialize authentication by getting and setting the auth token
 */
export async function initializeAuth(): Promise<void> {
  try {
    const token = await getAuthToken();
    if (token) {
      setAuthToken(token);
    }
  } catch (error) {
    console.error('Error initializing authentication:', error);
    clearAuthToken();
  }
}
