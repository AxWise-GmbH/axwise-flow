'use server';

import { apiClient } from '@/lib/apiClient';
import type { UploadResponse } from '@/types/api';

interface UploadResult {
  success: boolean;
  uploadResponse?: UploadResponse;
  error?: string;
}

/**
 * Server action to handle file uploads
 * 
 * @param formData - The form data containing the file
 * @returns UploadResult with success status and data or error
 */
export async function uploadAction(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return {
        success: false,
        error: 'No file selected'
      };
    }

    const isTextFile = formData.get('isTextFile') === 'true';
    
    // Set auth token - this should be handled differently in production
    apiClient.setAuthToken('dev-token-12345');
    
    const response = await apiClient.uploadData(file, isTextFile);
    
    return {
      success: true,
      uploadResponse: response
    };
  } catch (error) {
    console.error('Upload action error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Server action to analyze uploaded data
 * 
 * @param dataId - The ID of the uploaded data
 * @param isTextFile - Whether the file is a text file
 * @returns Analysis result with success status and data or error
 */
export async function analyzeAction(dataId: number, isTextFile: boolean) {
  try {
    // Set auth token - this should be handled differently in production
    apiClient.setAuthToken('dev-token-12345');
    
    const response = await apiClient.analyzeData(
      dataId,
      'gemini', // Hard-code gemini as the provider to avoid OpenAI key issues
      'gemini-2.0-flash', // Use gemini-2.0-flash model
      isTextFile
    );
    
    return {
      success: true,
      analysisResponse: response
    };
  } catch (error) {
    console.error('Analysis action error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown analysis error'
    };
  }
} 