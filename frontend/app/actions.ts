'use server';

/**
 * Server Actions for Upload and Analysis
 * 
 * These actions replace Zustand state management by handling
 * form submissions server-side.
 */

import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult, UploadResponse, AnalysisResponse } from '@/types/api';
 // Rem-addd UploadResponse, AnalysisResponse
import { cookies } from 'next/headers';

/**
 * Upload Action
 * Handles file uploads using server action
 */
export async function uploadAction(formData: FormData): Promise<{ success: true; uploadResponse: UploadResponse } | { success: false; error: string }> {
  try {
    const file = formData.get('file') as File;
    const isTextFile = formData.get('isTextFile') === 'true';
    
    if (!file) {
      return {
        success: false,
        error: 'No file provided'
      };
    }
    
    // Get auth token from cookie
    const cookieStore = cookies();
    const authToken = cookieStore.get('auth_token')?.value;
    
    if (!authToken) {
      return {
        success: false,
        error: 'Not authenticated'
      };
    }
    
    // Set the token on the API client
    apiClient.setAuthToken(authToken);
    
    const uploadResponse = await apiClient.uploadData(file, isTextFile);
    
    return {
      success: true,
      uploadResponse
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Analyze Action
 * Handles starting analysis using server action
 */
export async function analyzeAction(
  dataId: number,
  isTextFile: boolean,
  llmProvider: 'openai' | 'gemini' = 'gemini'
): Promise<{ success: true; analysisResponse: AnalysisResponse } | { success: false; error: string }> {
  try {
    // Get auth token from cookie
    const cookieStore = cookies();
    const authToken = cookieStore.get('auth_token')?.value;
    
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
export async function getRedirectUrl(analysisId: string): Promise<string> {
  return `/unified-dashboard/visualize?analysisId=${analysisId}`;
}

/**
 * Server-side analysis data fetcher
 * Fetches analysis data using server component
 */
export async function getServerSideAnalysis(analysisId: string): Promise<DetailedAnalysisResult | null> {
  if (!analysisId) {
      console.log("[getServerSideAnalysis] Received null or empty analysisId."); // DEBUG LOG
      return null;
  }
  console.log(`[getServerSideAnalysis] Received analysisId: ${analysisId}`); // DEBUG LOG
  
  try {
    // Get auth token from cookie
    const cookieStore = cookies();
    const authToken = cookieStore.get('auth_token')?.value;
    
    if (!authToken) {
      console.error('[getServerSideAnalysis] No auth token available for server fetch');
      return null;
    }
    
    // Set the token on the API client
    apiClient.setAuthToken(authToken);
    
    // Fetch analysis data
    console.log(`[getServerSideAnalysis] Calling apiClient.getAnalysisById with ID: ${analysisId}`); // DEBUG LOG
    const analysisData = await apiClient.getAnalysisById(analysisId);
    console.log(`[getServerSideAnalysis] Fetched data for ${analysisId}:`, analysisData ? `Status: ${analysisData.status}, Themes: ${analysisData.themes?.length}` : 'null'); // DEBUG LOG
    return analysisData;
  } catch (error) {
    console.error(`[getServerSideAnalysis] Error fetching analysis data server-side for ID ${analysisId}:`, error); // DEBUG LOG
    return null;
  }
}

/**
 * Fetch analysis history from the database
 */
export async function fetchAnalysisHistory(page: number = 1, pageSize: number = 10) {
  try {
    // Get auth token from cookie
    const cookieStore = cookies();
    const authToken = cookieStore.get('auth_token')?.value;

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
    // NOTE: Assumes apiClient.getAnalysisHistory exists and takes (skip, limit)
    // Also assumes the response format matches { items: [], totalCount: number }
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
