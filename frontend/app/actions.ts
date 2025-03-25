'use server';

/**
 * Server Actions for Upload and Analysis
 * 
 * These actions replace Zustand state management by handling
 * form submissions server-side.
 */

import { apiClient } from '@/lib/apiClient';
import type { UploadResponse, AnalysisResponse } from '@/types/api';
import { cookies } from 'next/headers';

/**
 * Upload Action
 * Handles file uploads using server action
 */
export async function uploadAction(formData: FormData) {
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
) {
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
export async function getRedirectUrl(analysisId: string) {
  return `/unified-dashboard/visualize?analysisId=${analysisId}`;
} 