/**
 * Priority insights methods for the API client
 */

import { apiCore } from './core';
import { PriorityInsightsResponse } from './types';

/**
 * Get priority insights for an analysis
 *
 * @param analysisId The ID of the analysis to get insights for
 * @returns A promise that resolves to the priority insights response
 */
export async function getPriorityInsights(analysisId: string): Promise<PriorityInsightsResponse> {
  try {
    console.log(`Getting priority insights for analysis ID: ${analysisId}`);

    // Try Next.js API route first
    try {
      const response = await apiCore.getClient().get(`/api/analysis/priority?result_id=${analysisId}`, {
        timeout: 30000, // 30 seconds timeout
        validateStatus: function (status) {
          // Accept 404 as a valid status code - we'll handle it in the response processing
          return (status >= 200 && status < 300) || status === 404;
        }
      });

      // If successful, process the response
      if (response.status !== 404 && response.data) {
        return {
          insights: response.data.insights,
          metrics: response.data.metrics || {
            high_urgency_count: 0,
            medium_urgency_count: 0,
            low_urgency_count: 0
          }
        };
      }
    } catch (apiError) {
      console.warn('Next.js API route failed, trying direct backend call:', apiError);
    }

    // Fallback to direct backend API call
    console.log('Making direct backend call for priority insights');
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const directResponse = await fetch(`${backendUrl}/api/analysis/priority?result_id=${analysisId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED'}`,
        'Content-Type': 'application/json',
      },
    });

    if (directResponse.ok) {
      const data = await directResponse.json();
      console.log('Direct backend call successful for priority insights');
      return {
        insights: data.insights,
        metrics: data.metrics || {
          high_urgency_count: 0,
          medium_urgency_count: 0,
          low_urgency_count: 0
        }
      };
    } else {
      console.error(`Direct backend call failed: ${directResponse.status} ${directResponse.statusText}`);
    }

    console.log('Priority insights response:', response.data);

    // Handle 404 case explicitly
    if (response.status === 404) {
      console.log('No insights found for this analysis (404 response)');
      return {
        insights: [],
        metrics: {
          high_urgency_count: 0,
          medium_urgency_count: 0,
          low_urgency_count: 0
        }
      };
    }

    // Check if the response has the expected structure
    if (!response.data || !response.data.insights) {
      console.error('Invalid insights response format:', response.data);

      // Return a default structure if the response is invalid
      return {
        insights: [],
        metrics: {
          high_urgency_count: 0,
          medium_urgency_count: 0,
          low_urgency_count: 0
        }
      };
    }

    return {
      insights: response.data.insights,
      metrics: response.data.metrics || {
        high_urgency_count: 0,
        medium_urgency_count: 0,
        low_urgency_count: 0
      }
    };
  } catch (error: Error | unknown) {
    console.error('Error getting priority insights:', error);

    // Return empty insights on error
    return {
      insights: [],
      metrics: {
        high_urgency_count: 0,
        medium_urgency_count: 0,
        low_urgency_count: 0
      }
    };
  }
}
