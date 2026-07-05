/**
 * Results retrieval methods for the API client
 */

import { apiCore } from './core';
import { DetailedAnalysisResult, SentimentOverview } from './types';
import { generateMockAnalyses } from './mocks';
import { getAnalysisById } from './results-detail';

// Re-export getAnalysisById from results-detail.ts
export { getAnalysisById };

/**
 * List all analyses
 *
 * @param params Optional parameters for filtering analyses
 * @returns A promise that resolves to an array of detailed analysis results
 */
export async function listAnalyses(params?: unknown): Promise<DetailedAnalysisResult[]> {
  console.log('ApiClient: listAnalyses called with params:', params);
  try {
    // Add timeout and retry options
    const response = await apiCore.getClient().get('/api/analyses', {
      params,
      timeout: 10000, // 10 second timeout
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Origin': typeof window !== 'undefined' ? window.location.origin : ''  // Use a custom header instead of Origin
      }
    });

    console.log('ApiClient: listAnalyses response received', response.status);

    // Detailed response logging
    console.log('Response headers:', response.headers);
    console.log('Raw response data type:', typeof response.data);

    // Ensure we have an array, even if backend returns an object
    let analysesArray: DetailedAnalysisResult[] = [];

    if (Array.isArray(response.data)) {
      console.log(`Processing array response with ${response.data.length} items`);
      analysesArray = response.data;
    } else if (response.data && typeof response.data === 'object') {
      // If response is an object, check if it has numeric keys (like an object representation of an array)
      console.log('Processing object response, checking format');

      // If it's a regular object, check if it has an 'error' property
      if (response.data.error) {
        console.error('Server returned error:', response.data.error);
        return generateMockAnalyses();
      }

      // If it's an array-like object, convert to array
      if (Object.keys(response.data).some(key => !isNaN(Number(key)))) {
        console.log('Converting array-like object to array');
        analysesArray = Object.values(response.data);
      } else {
        // Last resort - wrap single object in array if it has expected properties
        if ('id' in response.data && 'status' in response.data) {
          console.log('Wrapping single analysis object in array');
          analysesArray = [response.data as DetailedAnalysisResult];
        }
      }
    }

    // Handle empty results - try direct backend call if no data
    if (analysesArray.length === 0) {
      console.log('No analyses found in response, trying direct backend call');

      // Try direct backend API call with proper authentication
      try {
        const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const queryParams = new URLSearchParams();

        // Convert params to query string
        if (params && typeof params === 'object') {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              queryParams.append(key, String(value));
            }
          });
        }

        // Get proper auth token
        const authToken = await apiCore.getAuthToken();
        if (!authToken) {
          throw new Error('No authentication token available');
        }

        const url = `${backendUrl}/api/analyses${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
        const directResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (directResponse.ok) {
          const directData = await directResponse.json();
          console.log('Direct backend call successful for listAnalyses, found', directData.length, 'items');
          if (Array.isArray(directData) && directData.length > 0) {
            return directData;
          }
        } else {
          console.error(`Direct backend call failed: ${directResponse.status} ${directResponse.statusText}`);
        }
      } catch (directError) {
        console.error('Direct backend call error:', directError);
      }

      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('No analyses found. Try uploading a file first.');
      }
    } else {
      console.log(`Returning ${analysesArray.length} analyses`);
    }

    return analysesArray;

  } catch (error: Error | unknown) {
    console.error('API error, trying direct backend call:', error);

    // Try direct backend API call with proper authentication
    try {
      const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const queryParams = new URLSearchParams();

      // Convert params to query string
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });
      }

      // Get proper auth token
      const authToken = await apiCore.getAuthToken();
      if (!authToken) {
        throw new Error('No authentication token available');
      }

      const url = `${backendUrl}/api/analyses${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Direct backend call successful for listAnalyses');
        return Array.isArray(data) ? data : [];
      } else {
        console.error(`Direct backend call failed: ${response.status} ${response.statusText}`);
      }
    } catch (directError) {
      console.error('Direct backend call error:', directError);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch analyses: ${errorMessage}`);
  }
}

/**
 * Get analysis history with pagination
 *
 * @param skip Number of items to skip (default: 0)
 * @param limit Maximum number of items to return (default: 10)
 * @returns A promise that resolves to an object containing the items and total count
 */
export async function getAnalysisHistory(skip: number = 0, limit: number = 10): Promise<{ items: DetailedAnalysisResult[], totalCount: number }> {
  try {
    console.log(`[getAnalysisHistory] Fetching history with skip: ${skip}, limit: ${limit}`);
    // Try the correct endpoint first
    try {
      const response = await apiCore.getClient().get('/api/analyses', {
        params: {
          offset: skip,
          limit: limit
        },
        timeout: 15000 // 15 second timeout
      });

      // Assuming the backend returns { items: [...], total_count: number }
      const items = response.data?.items || [];
      const totalCount = response.data?.total_count || 0;

      console.log(`[getAnalysisHistory] Received ${items.length} history items, total count: ${totalCount}`);
      return { items, totalCount };
    } catch (firstError) {
      console.warn('[getAnalysisHistory] Error with first endpoint, trying direct backend call:', firstError);

      // Try direct backend API call with real Clerk token
      try {
        const authToken = await getAuthToken();
        if (!authToken) {
          throw new Error('Authentication required');
        }

        const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/api/analyses?offset=${skip}&limit=${limit}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`, // Real Clerk token
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[getAnalysisHistory] Direct backend call successful, received ${data.length} items`);
          return { items: data || [], totalCount: data?.length || 0 };
        } else {
          console.error(`[getAnalysisHistory] Direct backend call failed: ${response.status} ${response.statusText}`);
        }
      } catch (directError) {
        console.error('[getAnalysisHistory] Direct backend call error:', directError);
      }

      // Try fallback endpoint
      try {
        const response = await apiCore.getClient().get('/api/analyses/history', {
          params: {
            offset: skip,
            limit: limit
          },
          timeout: 15000 // 15 second timeout
        });

        const items = response.data?.items || [];
        const totalCount = response.data?.total_count || 0;
        console.log(`[getAnalysisHistory] Received ${items.length} items from fallback endpoint`);
        return { items, totalCount };
      } catch (secondError) {
        console.error('[getAnalysisHistory] All endpoints failed:', secondError);
        // Return empty data in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('[getAnalysisHistory] Returning empty data in development mode');
          return { items: [], totalCount: 0 };
        }
        throw new Error(`Failed to fetch analysis history: ${secondError instanceof Error ? secondError.message : 'Unknown error'}`);
      }
    }
  } catch (error: Error | unknown) {
    console.error('[getAnalysisHistory] Unexpected error:', error);
    // Return empty data in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('[getAnalysisHistory] Returning empty data in development mode');
      return { items: [], totalCount: 0 };
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch analysis history: ${errorMessage}`);
  }
}
