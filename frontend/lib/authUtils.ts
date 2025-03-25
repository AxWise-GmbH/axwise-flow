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
    const clerksToken = await apiClient.getAuthToken();
    
    if (clerksToken) {
      console.log('Setting Clerk auth token');
      apiClient.setAuthToken(clerksToken);
      return;
    }
    
    // For development mode, provide a test token
    // This matches the "testuser123" ID expected by the backend in dev mode
    const devToken = 'DEV_TOKEN_REDACTED';
    console.log('Setting development auth token');
    apiClient.setAuthToken(devToken);
  } catch (error) {
    console.error('Error initializing authentication:', error);
  }
}; 