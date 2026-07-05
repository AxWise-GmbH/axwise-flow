import { DetailedAnalysisResult, ListAnalysesParams } from '@/types/api';

/**
 * Server-side version of the API client
 * 
 * This client is designed to be used in server components and doesn't
 * rely on browser-specific APIs like window. It uses native fetch.
 */
export const serverApiClient = {
  /**
   * Fetch the list of analyses from the API
   * Server-safe implementation
   */
  async listAnalyses(params?: ListAnalysesParams): Promise<DetailedAnalysisResult[]> {
    try {
      // Use environment variable or fallback URL
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const url = `${baseUrl}/api/analyses`;
      
      // Add params to query string if provided
      const queryParams = new URLSearchParams();
      if (params) {
        if (params.sortBy) queryParams.append('sort_by', params.sortBy);
        if (params.sortDirection) queryParams.append('sort_direction', params.sortDirection);
        
        // Only add status if it's defined and not 'all'
        const status = params.status as string | undefined;
        if (status && status !== 'all') {
          queryParams.append('status', status);
        }
      }
      
      // Construct final URL with query parameters
      const urlWithParams = queryParams.toString() 
        ? `${url}?${queryParams.toString()}` 
        : url;
      
      // Use a fixed auth token for server-side requests
      // In a production app, this would use proper server-side auth
      const headers = { 
        'Authorization': 'Bearer testuser123',
        'Content-Type': 'application/json'
      };
      
      // Make the request
      const response = await fetch(urlWithParams, { 
        method: 'GET',
        headers 
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.analyses || [];
    } catch (error) {
      console.error('Server API client error:', error);
      return [];
    }
  },
  
  /**
   * Get a single analysis by ID
   * Server-safe implementation
   */
  async getAnalysisById(analysisId: string): Promise<DetailedAnalysisResult | null> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const url = `${baseUrl}/api/results/${analysisId}`;
      
      const headers = { 
        'Authorization': 'Bearer testuser123',
        'Content-Type': 'application/json'
      };
      
      const response = await fetch(url, { 
        method: 'GET',
        headers 
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Server API client error fetching analysis ${analysisId}:`, error);
      return null;
    }
  }
}; 