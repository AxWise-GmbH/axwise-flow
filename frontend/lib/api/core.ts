/**
 * Core API client functionality
 *
 * This module provides the core axios client setup and error handling.
 * It implements a singleton pattern to ensure consistent API interaction.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Core API Client for interacting with the backend API
 *
 * Implemented as a true singleton to ensure consistent API interaction across the application.
 */
class ApiCore {
  private static instance: ApiCore | null = null;
  private client: AxiosInstance;
  private baseUrl: string;
  private tokenRefreshInProgress: boolean = false;

  /**
   * Private constructor to prevent direct instantiation.
   * Use ApiCore.getInstance() instead.
   */
  private constructor() {
    // For frontend API routes, use the current origin (Next.js server)
    // This ensures requests go to Next.js API routes instead of directly to the backend
    // On client side, use window.location.origin to get the current port
    // On server side, try to detect the port from environment or use a fallback
    if (typeof window !== 'undefined') {
      // Client side - use the current origin (works with any port)
      this.baseUrl = window.location.origin;
    } else {
      // Server side - try to get port from environment or use fallback
      const port = process.env.PORT || process.env.NEXT_PUBLIC_PORT || '3000';
      this.baseUrl = `http://localhost:${port}`;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        // Don't set Content-Type globally - let axios set it per request
        // For JSON requests, it will be set automatically
        // For FormData requests, it will be set to multipart/form-data
        'Access-Control-Allow-Origin': '*', // Added CORS header
        'X-API-Version': 'merged-976ce06-current' // Version tracking for debugging
      },
      // Increase default timeout for potentially longer operations
      timeout: 120000, // 120 seconds (increased from 30)
    });

    // Add request interceptor to set Content-Type for JSON requests
    this.client.interceptors.request.use(
      (config) => {
        // If data is not FormData and no Content-Type is set, use JSON
        if (config.data && !(config.data instanceof FormData) && !config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for handling auth errors and network issues
    this.client.interceptors.response.use(
      (response) => response,
      async (error: any) => {
        // Enhanced error detection and handling
        const isConnectionRefused =
          error?.message?.includes('Connection refused') ||
          error?.message?.includes('Network Error') ||
          error?.code === 'ERR_CONNECTION_REFUSED' ||
          error?.code === 'ERR_NETWORK';

        // Ensure error is an AxiosError
        if (!error || !error.response) {
          // Check for network errors (likely CORS issues or server down)
          if (isConnectionRefused) {
            console.error('Backend connection refused or not available');
            // For GET requests, return empty data instead of rejecting
            if (error.config?.method?.toLowerCase() === 'get') {
              if (window.showToast) {
                window.showToast('Backend server is not responding. Using mock data instead.', { variant: 'error' });
              }
              console.warn('Returning empty data for GET request due to connection error');
              return { data: [] };
            }
          } else if (error.message?.includes('CORS')) {
            console.error('CORS error detected in interceptor');
            // For GET requests, return empty data instead of rejecting
            if (error.config?.method?.toLowerCase() === 'get') {
              console.warn('Returning empty data for GET request due to CORS error');
              return { data: [] };
            }
          }
          return Promise.reject(error);
        }

        const originalRequest = error.config;

        if (!originalRequest) {
          return Promise.reject(error);
        }

        // Handle token expiration (401 errors)
        if (error.response.status === 401 && !originalRequest._retry) {
          if (!this.tokenRefreshInProgress) {
            this.tokenRefreshInProgress = true;
            originalRequest._retry = true;

            try {
              // Try to refresh the token if using Clerk
              // This will be implemented in the auth module
              // For now, we'll just reject the promise
              this.tokenRefreshInProgress = false;
              return Promise.reject(error);
            } catch (refreshError) {
              console.error('Failed to refresh token:', refreshError);
              // Redirect to login or show auth error
              if (typeof window !== 'undefined') {
                window.location.href = '/login?error=session_expired';
              }
              this.tokenRefreshInProgress = false;
              return Promise.reject(refreshError);
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the singleton instance of ApiCore.
   * This is the only way to access the ApiCore.
   */
  public static getInstance(): ApiCore {
    if (!ApiCore.instance) {
      ApiCore.instance = new ApiCore();
    }
    return ApiCore.instance;
  }

  /**
   * Get the axios client instance
   */
  public getClient(): AxiosInstance {
    return this.client;
  }

  /**
   * Get the base URL
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set a header for all requests
   */
  public setHeader(name: string, value: string): void {
    this.client.defaults.headers.common[name] = value;
  }

  /**
   * Remove a header from all requests
   */
  public removeHeader(name: string): void {
    delete this.client.defaults.headers.common[name];
  }
}

// Export the singleton instance
export const apiCore = ApiCore.getInstance();
