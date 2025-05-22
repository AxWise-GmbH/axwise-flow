'use client';

/**
 * Client-side Actions for Upload and Analysis
 *
 * These actions replace server actions for static exports
 */

import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult, UploadResponse, AnalysisResponse } from '@/types/api';

/**
 * Upload Action
 * Handles file uploads using client-side code
 */
export async function uploadAction(formData: FormData): Promise<{ success: true; uploadResponse: UploadResponse } | { success: false; error: string }> {
  try {
    // Get the file from the FormData
    const file = formData.get('file');
    const isTextFile = formData.get('isTextFile') === 'true';

    // Validate file
    if (!file || !(file instanceof File)) {
      console.error('Invalid file object:', file);
      return {
        success: false,
        error: 'No valid file provided'
      };
    }

    // Log file details for debugging
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Get auth token from localStorage or cookies in the browser
    let authToken = '';
    
    // Try to get token from localStorage first
    if (typeof window !== 'undefined') {
      authToken = localStorage.getItem('auth_token') || '';
      
      // If not in localStorage, try to get from cookies
      if (!authToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            authToken = value;
            break;
          }
        }
      }
    }

    if (!authToken) {
      return {
        success: false,
        error: 'Not authenticated'
      };
    }

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    // Create a new FormData to send to the API
    const apiFormData = new FormData();
    
    // Add the file to FormData
    apiFormData.append('file', file);
    apiFormData.append('is_free_text', String(isTextFile));

    // Make the API request
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: apiFormData
    });

    if (!response.ok) {
      let errorMessage = `Upload failed with status: ${response.status}`;
      
      try {
        const errorData = await response.json();
        if (errorData) {
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
            errorMessage = errorData.detail.map((err: any) =>
              `${err.loc ? err.loc.join('.'): ''}: ${err.msg || 'Unknown error'}`
            ).join(', ');
          } else if (typeof errorData.message === 'string') {
            errorMessage = errorData.message;
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        }
      } catch (jsonError) {
        // If we can't parse the response as JSON, try to get the text
        try {
          const textResponse = await response.clone().text();
          if (textResponse) {
            errorMessage = `Server error: ${textResponse.substring(0, 200)}`;
          }
        } catch (textError) {
          // If we can't get the text either, use the status code
          console.error('Failed to read error response as text:', textError);
        }
      }
      
      throw new Error(errorMessage);
    }

    // Parse the response
    const uploadResponse = await response.json();

    return {
      success: true,
      uploadResponse
    };
  } catch (error) {
    console.error('Upload error:', error);
    
    let errorMessage = 'Unknown upload error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      const errorObj = error as any;
      
      if (typeof errorObj.message === 'string') {
        errorMessage = errorObj.message;
      } else if (typeof errorObj.error === 'string') {
        errorMessage = errorObj.error;
      } else if (typeof errorObj.detail === 'string') {
        errorMessage = errorObj.detail;
      }
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Analyze Action
 * Handles starting analysis using client-side code
 */
export async function analyzeAction(
  dataId: number,
  isTextFile: boolean,
  llmProvider: 'openai' | 'gemini' = 'gemini'
): Promise<{ success: true; analysisResponse: AnalysisResponse } | { success: false; error: string }> {
  try {
    // Get auth token from localStorage or cookies in the browser
    let authToken = '';
    
    // Try to get token from localStorage first
    if (typeof window !== 'undefined') {
      authToken = localStorage.getItem('auth_token') || '';
      
      // If not in localStorage, try to get from cookies
      if (!authToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            authToken = value;
            break;
          }
        }
      }
    }

    if (!authToken) {
      return {
        success: false,
        error: 'Not authenticated'
      };
    }

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    const analysisResponse = await apiClient.analyzeData(dataId, llmProvider, undefined, isTextFile);

    return {
      success: true,
      analysisResponse
    };
  } catch (error) {
    console.error('Analysis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown analysis error'
    };
  }
}

/**
 * Redirect after successful analysis
 * Helper function to generate URL for redirection
 */
export function getRedirectUrl(analysisId: string): string {
  // Add timestamp to prevent caching issues
  const timestamp = Date.now();
  const url = `/unified-dashboard/visualize?analysisId=${analysisId}&visualizationTab=themes&timestamp=${timestamp}`;
  return url;
}

/**
 * Client-side analysis data fetcher
 */
export async function getClientSideAnalysis(analysisId: string): Promise<DetailedAnalysisResult | null> {
  if (!analysisId) {
    console.log("[getClientSideAnalysis] Received null or empty analysisId.");
    return null;
  }

  try {
    // Get auth token from localStorage or cookies
    let authToken = '';
    
    if (typeof window !== 'undefined') {
      authToken = localStorage.getItem('auth_token') || '';
      
      if (!authToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            authToken = value;
            break;
          }
        }
      }
    }

    if (!authToken) {
      console.error('[getClientSideAnalysis] No auth token available');
      return null;
    }

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    // Fetch analysis data
    const analysisData = await apiClient.getAnalysisById(analysisId);
    return analysisData;
  } catch (error) {
    console.error(`[getClientSideAnalysis] Error fetching analysis data for ID ${analysisId}:`, error);
    return null;
  }
}

/**
 * Get the latest completed analysis for the current user
 */
export async function getLatestCompletedAnalysis(): Promise<DetailedAnalysisResult | null> {
  try {
    // Get auth token from localStorage or cookies
    let authToken = '';
    
    if (typeof window !== 'undefined') {
      authToken = localStorage.getItem('auth_token') || '';
      
      if (!authToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            authToken = value;
            break;
          }
        }
      }
    }

    if (!authToken) {
      console.error('[getLatestCompletedAnalysis] No auth token available');
      return null;
    }

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    try {
      // Try to get from history API
      const response = await apiClient.getAnalysisHistory(0, 1);

      // Check if we have any completed analyses
      if (response.items && response.items.length > 0 && response.items[0].status === 'completed') {
        return response.items[0];
      }
    } catch (historyError) {
      console.error('[getLatestCompletedAnalysis] Error fetching analysis history:', historyError);
    }

    // Fallback: Try to get the analysis ID from localStorage
    try {
      const recentAnalysisId = localStorage.getItem('recentAnalysisId');
      if (recentAnalysisId) {
        const analysisData = await apiClient.getAnalysisById(recentAnalysisId);
        if (analysisData && analysisData.status === 'completed') {
          return analysisData;
        }
      }
    } catch (fallbackError) {
      console.error('[getLatestCompletedAnalysis] Fallback error:', fallbackError);
    }

    return null;
  } catch (error) {
    console.error('[getLatestCompletedAnalysis] Error:', error);
    return null;
  }
}

/**
 * Fetch analysis history from the database
 */
export async function fetchAnalysisHistory(page: number = 1, pageSize: number = 10) {
  try {
    // Get auth token from localStorage or cookies
    let authToken = '';
    
    if (typeof window !== 'undefined') {
      authToken = localStorage.getItem('auth_token') || '';
      
      if (!authToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            authToken = value;
            break;
          }
        }
      }
    }

    if (!authToken) {
      return {
        success: false,
        error: 'Not authenticated',
        items: [],
        totalItems: 0,
        currentPage: page
      };
    }

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    // Set up pagination parameters
    const skip = (page - 1) * pageSize;

    // Call API to fetch history data
    const response = await apiClient.getAnalysisHistory(skip, pageSize);

    return {
      success: true,
      items: response.items || [],
      totalItems: response.totalCount || 0,
      currentPage: page
    };
  } catch (error) {
    console.error('Error fetching analysis history:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching history',
      items: [],
      totalItems: 0,
      currentPage: page
    };
  }
}
