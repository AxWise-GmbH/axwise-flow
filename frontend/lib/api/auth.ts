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
        console.log('Successfully retrieved Clerk token');
        return token;
      }
    }

    // No token available
    console.log('No Clerk session or token available');
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
    console.warn('Attempted to set empty token');
    return;
  }
  apiCore.setHeader('Authorization', `Bearer ${token}`);
  console.log('Auth token set successfully');
}

/**
 * Clear the authentication token for API requests
 */
export function clearAuthToken(): void {
  apiCore.removeHeader('Authorization');
  console.log('Auth token cleared');
}

/**
 * Initialize authentication by getting and setting the auth token
 */
export async function initializeAuth(): Promise<void> {
  try {
    const token = await getAuthToken();
    if (token) {
      setAuthToken(token);
      console.log('Authentication initialized successfully with Clerk token');
    } else {
      // Check if we're in development mode and Clerk validation is disabled
      const isProduction = process.env.NODE_ENV === 'production';
      const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

      console.log('API Auth initialization:', { isProduction, enableClerkValidation, nodeEnv: process.env.NODE_ENV });

      if (!isProduction && !enableClerkValidation) {
        // For development mode only, provide a test token
        const devToken = 'DEV_TOKEN_REDACTED';
        setAuthToken(devToken);
        console.log('Authentication initialized with development token (development mode only)');
      } else {
        // In production or when Clerk validation is enabled, require proper authentication
        console.log('No authentication token available - user must sign in');
        clearAuthToken();
      }
    }
  } catch (error) {
    console.error('Error initializing authentication:', error);
    clearAuthToken();
  }
}
