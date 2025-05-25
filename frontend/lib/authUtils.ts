/**
 * Authentication utilities for the application
 *
 * Last Updated: 2025-03-25
 */

import { apiClient } from './apiClient';

/**
 * Initializes authentication for the application
 * Sets up the API client with the appropriate authentication token
 */
export const initializeAuth = async (): Promise<void> => {
  try {
    // Check if a Clerk token is available
    const clerkToken = await apiClient.getAuthToken();

    if (clerkToken) {
      console.log('Setting Clerk auth token');
      apiClient.setAuthToken(clerkToken);
      return;
    }

    // Check if we're in development mode and Clerk validation is disabled
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

    console.log('Auth initialization:', { isProduction, enableClerkValidation, nodeEnv: process.env.NODE_ENV });

    if (!isProduction && !enableClerkValidation) {
      // For development mode only, provide a test token
      const devToken = 'DEV_TOKEN_REDACTED';
      console.log('Setting development auth token (development mode only)');
      apiClient.setAuthToken(devToken);
    } else {
      // In production or when Clerk validation is enabled, require proper authentication
      console.log('No authentication token available - user must sign in');
      apiClient.clearAuthToken();
    }
  } catch (error) {
    console.error('Error initializing authentication:', error);
    // In case of error, clear any existing tokens
    apiClient.clearAuthToken();
  }
};
