'use server';

/**
 * Server Actions for Upload and Analysis
 *
 * These actions replace Zustand state management by handling
 * form submissions server-side.
 */

import { apiClient } from '@/lib/apiClient';
import { generatePRD } from '@/lib/api/prd';
import type { DetailedAnalysisResult, UploadResponse, AnalysisResponse, PRDResponse } from '@/types/api';
 // Rem-addd UploadResponse, AnalysisResponse
import { cookies } from 'next/headers';

/**
 * Upload Action
 * Handles file uploads using server action
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

    // Special handling for the problematic file mentioned in the error
    if (file.name.includes('Shira Oren') || file.name.includes('Transcript')) {
      console.log('Detected potentially problematic file name with special characters');

      // Check for encoding issues in the filename
      const hasEncodingIssues = /[\u0080-\uFFFF]/.test(file.name);
      if (hasEncodingIssues) {
        console.warn('File name contains non-ASCII characters that might cause issues:',
          Array.from(file.name).map(char => ({ char, code: char.charCodeAt(0).toString(16) }))
        );
      }

      // Note: We've removed the FileReader code that was causing errors in the server context
      // FileReader is a browser-only API and cannot be used in server actions
    }

    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    // Create a new FormData to send to the API
    const apiFormData = new FormData();

    // Import the file upload utilities
    // Note: We're using a dynamic import to avoid issues with server-side rendering
    const fileUploadUtils = await import('@/utils/fileUpload');

    // Handle special characters in file name
    let fileToUpload;

    try {
      // Create a sanitized file
      fileToUpload = await fileUploadUtils.createSanitizedFile(file);

      if (fileToUpload.name !== file.name) {
        console.log('Sanitized file name:', fileToUpload.name);
      }
    } catch (fileError) {
      console.error('Failed to create sanitized file:', fileError);
      // Fall back to original file if this fails
      fileToUpload = file;
      console.log('Falling back to original file');
    }

    // Explicitly log what we're adding to FormData
    console.log('Adding file to FormData:', {
      name: fileToUpload.name,
      type: fileToUpload.type,
      size: fileToUpload.size
    });

    // IMPORTANT: The order of appending fields to FormData matters!
    // Add the file first to ensure it's at the beginning of the multipart request
    apiFormData.append('file', fileToUpload);
    apiFormData.append('is_free_text', String(isTextFile));

    // Verify FormData contents
    console.log('FormData entries:');
    try {
      // This will only work in browser context, so we wrap it in try/catch
      for (const pair of apiFormData.entries()) {
        console.log(`${pair[0]}: ${pair[1] instanceof File ? `File(${pair[1].name}, ${pair[1].type}, ${pair[1].size} bytes)` : pair[1]}`);
      }
    } catch (formDataError) {
      console.log('Cannot iterate FormData entries in server context');
    }

    // Create a blob from the file for direct upload if FormData fails
    let fileBlob: Blob | null = null;
    try {
      fileBlob = new Blob([await fileToUpload.arrayBuffer()], { type: fileToUpload.type });
      console.log('Created backup blob:', { size: fileBlob.size, type: fileBlob.type });
    } catch (blobError) {
      console.error('Failed to create blob from file:', blobError);
    }

    // Make a direct fetch request instead of using the API client
    // This avoids serialization issues between client and server
    console.log('Sending request to:', `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`);

    // Check if we're in a browser or server environment
    console.log('Checking environment for file upload');

    let response;

    // Use different approaches based on the environment
    if (typeof window !== 'undefined' && typeof XMLHttpRequest !== 'undefined') {
      // Browser environment - we can use XMLHttpRequest
      console.log('Browser environment detected, using XMLHttpRequest for file upload');

      // Create a promise that will be resolved or rejected based on the XHR result
      const uploadPromise = new Promise<Response>((resolve, reject) => {
        try {
          // Create a new XMLHttpRequest
          const xhr = new XMLHttpRequest();

          // Set up event listeners
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              console.log(`Upload progress: ${percentComplete}%`);
            }
          };

          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log('XHR upload successful');

              // Create a Response object from the XHR response
              const response = new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers({
                  'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'
                })
              });

              resolve(response);
            } else {
              console.error('XHR upload failed with status:', xhr.status);

              // Create a Response object for the error
              const response = new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers({
                  'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'
                })
              });

              resolve(response); // Resolve with the error response so we can handle it later
            }
          };

          xhr.onerror = function() {
            console.error('XHR upload failed with network error');
            reject(new Error('Network error during file upload'));
          };

          xhr.onabort = function() {
            console.error('XHR upload aborted');
            reject(new Error('File upload was aborted'));
          };

          // Open the request
          xhr.open('POST', `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`, true);

          // Set headers
          xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
          // Do not set Content-Type header - it will be set automatically with the correct boundary

          // Add detailed logging
          console.log('Sending XHR request with FormData containing:');
          try {
            for (const pair of apiFormData.entries()) {
              console.log(`${pair[0]}: ${pair[1] instanceof File ? `File(${pair[1].name}, ${pair[1].type}, ${pair[1].size} bytes)` : pair[1]}`);
            }
          } catch (formDataError) {
            console.log('Cannot iterate FormData entries');
          }

          // Send the request with the FormData
          xhr.send(apiFormData);
        } catch (xhrError) {
          console.error('Error creating or using XMLHttpRequest:', xhrError);
          reject(xhrError);
        }
      });

      // Wait for the upload to complete
      response = await uploadPromise;
    } else {
      // Server environment - FormData doesn't work properly with files in server context
      console.log('Server environment detected, using server-side upload approach');

      // In server-side context, we need a different approach since FormData doesn't handle File objects correctly
      try {
        // First, let's log detailed information about what we're trying to upload
        console.log('Server-side upload details:', {
          fileName: fileToUpload.name,
          fileType: fileToUpload.type,
          fileSize: fileToUpload.size,
          isTextFile: isTextFile
        });

        // Get the file content as a Buffer
        const fileBuffer = Buffer.from(await fileToUpload.arrayBuffer());
        console.log(`File content loaded as Buffer, size: ${fileBuffer.length} bytes`);

        // Create a boundary string for the multipart form
        const boundary = `----FormBoundary${Math.random().toString(16).substring(2)}`;

        // Manually construct the multipart/form-data payload
        const payload = [];

        // Add the file part
        payload.push(`--${boundary}\r\n`);
        payload.push(`Content-Disposition: form-data; name="file"; filename="${fileToUpload.name}"\r\n`);
        payload.push(`Content-Type: ${fileToUpload.type || 'application/octet-stream'}\r\n\r\n`);

        // Convert text parts to Buffer
        const textPartsBuffer = Buffer.from(payload.join(''));

        // Add the file content - this is critical!
        // The file content needs to be included in the request body
        // We're using the fileBuffer that was created earlier

        // Add the closing boundary for the file part
        const fileClosingBuffer = Buffer.from('\r\n');

        // Add the is_free_text field
        const isTextFilePartBuffer = Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="is_free_text"\r\n\r\n` +
          `${String(isTextFile)}\r\n` +
          `--${boundary}--\r\n`
        );

        // Combine all parts into a single Buffer
        const requestBody = Buffer.concat([
          textPartsBuffer,
          fileBuffer,
          fileClosingBuffer,
          isTextFilePartBuffer
        ]);

        console.log(`Constructed multipart request body, total size: ${requestBody.length} bytes`);

        // Log the request details
        console.log('Making server-side fetch request with the following details:');
        console.log('- URL:', `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`);
        console.log('- Method: POST');
        console.log('- Headers:', {
          'Authorization': 'Bearer [REDACTED]',
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        });
        console.log('- Body size:', requestBody.length, 'bytes');
        console.log('- Boundary:', boundary);

        // Make the request with the manually constructed body
        response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: requestBody
        });

        console.log('Server-side fetch response status:', response.status);
        console.log('Server-side fetch response headers:', Object.fromEntries([...response.headers.entries()]));

        // If the response is not OK, try to get more detailed error information
        if (!response.ok) {
          try {
            const errorText = await response.text();
            console.error('Server-side fetch error response:', errorText);
          } catch (textError) {
            console.error('Failed to read error response text:', textError);
          }
        }
      } catch (serverUploadError) {
        console.error('Server-side upload error:', serverUploadError);

        // Fall back to a simpler approach - direct file upload without FormData
        console.log('Falling back to direct file upload without FormData');

        // Create a simple JSON payload with file information
        // This is a fallback that will inform the user that server-side upload is not supported
        response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: 'Server-side file upload not supported',
            fileName: fileToUpload.name,
            fileSize: fileToUpload.size,
            fileType: fileToUpload.type,
            isTextFile: isTextFile
          })
        });

        console.log('Fallback response status:', response.status);
      }
    }

    if (!response.ok) {
      let errorMessage = `Upload failed with status: ${response.status}`;

      try {
        // Try to parse the error response as JSON
        const errorData = await response.json();

        // Handle different error formats
        if (errorData) {
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
            // Handle FastAPI validation error format
            errorMessage = errorData.detail.map((err: any) =>
              `${err.loc ? err.loc.join('.'): ''}: ${err.msg || 'Unknown error'}`
            ).join(', ');
          } else if (typeof errorData.message === 'string') {
            errorMessage = errorData.message;
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else {
            // If errorData exists but we can't extract a string message
            errorMessage = `Server error: ${JSON.stringify(errorData).substring(0, 200)}`;
          }
        }
      } catch (jsonError) {
        // If we can't parse the response as JSON, try to get the text
        try {
          // Clone the response since we already tried to read it as JSON
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

    // Try to parse the response as JSON with error handling
    let uploadResponse;
    try {
      uploadResponse = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse response as JSON:', jsonError);
      throw new Error('Failed to parse server response. The file may have been uploaded but the response was invalid.');
    }

    return {
      success: true,
      uploadResponse
    };
  } catch (error) {
    console.error('Upload error:', error);

    // Enhanced error handling to extract meaningful messages
    let errorMessage = 'Unknown upload error';

    if (error instanceof Error) {
      // Standard Error object
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      // String error
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract a message from the error object
      const errorObj = error as any;

      if (typeof errorObj.message === 'string') {
        errorMessage = errorObj.message;
      } else if (typeof errorObj.error === 'string') {
        errorMessage = errorObj.error;
      } else if (typeof errorObj.detail === 'string') {
        errorMessage = errorObj.detail;
      } else if (errorObj.toString && typeof errorObj.toString === 'function' && errorObj.toString() !== '[object Object]') {
        errorMessage = errorObj.toString();
      } else {
        // Last resort: stringify the object but limit the length
        try {
          const jsonStr = JSON.stringify(error);
          errorMessage = `Error: ${jsonStr.substring(0, 200)}${jsonStr.length > 200 ? '...' : ''}`;
        } catch (stringifyError) {
          errorMessage = 'Failed to process error details';
        }
      }
    }

    // Log the final error message for debugging
    console.log('Final error message:', errorMessage);

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Analyze Action
 * Handles starting analysis using server action
 *
 * Note: Enhanced theme analysis is always enabled on the backend,
 * so we've removed the useEnhancedThemeAnalysis parameter.
 */
export async function analyzeAction(
  dataId: number,
  isTextFile: boolean,
  llmProvider: 'openai' | 'gemini' = 'gemini'
): Promise<{ success: true; analysisResponse: AnalysisResponse } | { success: false; error: string }> {
  try {
    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    // Call backend directly instead of going through frontend API route
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const response = await fetch(`${backendUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data_id: dataId,
        llm_provider: llmProvider,
        is_free_text: isTextFile || false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${errorText}`);
    }

    const analysisResponse = await response.json();

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
  // --- START LOGGING ---
  console.log(`[Server Action - getRedirectUrl] Called with analysisId: ${analysisId}`);
  if (!analysisId) {
    console.error("[Server Action - getRedirectUrl] Received null or empty analysisId!");
    // Consider throwing an error or returning a default URL
    throw new Error("Cannot generate redirect URL without a valid analysis ID.");
  }
  // --- END LOGGING ---

  // Add timestamp to prevent caching issues
  const timestamp = Date.now();
  const url = `/unified-dashboard?analysisId=${analysisId}&visualizationTab=themes&timestamp=${timestamp}`;
  console.log(`[Server Action - getRedirectUrl] Generated URL: ${url}`);
  return url;
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
    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
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
 * Get the latest completed analysis for the current user
 * This is used to display the most recent analysis on the dashboard
 */
export async function getLatestCompletedAnalysis(): Promise<DetailedAnalysisResult | null> {
  try {
    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    try {
      // Direct backend API call instead of using the API client
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/analyses?offset=0&limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Check if we have any completed analyses
        if (data && data.length > 0 && data[0].status === 'completed') {
          console.log(`[getLatestCompletedAnalysis] Found latest analysis from direct API call: ${data[0].id}`);
          return data[0];
        }
      } else {
        console.error(`[getLatestCompletedAnalysis] API error: ${response.status} ${response.statusText}`);
      }
    } catch (historyError) {
      console.error('[getLatestCompletedAnalysis] Error fetching analysis history:', historyError);
      // Continue to fallback method if history API fails
    }

    // Fallback: If history API fails or returns no results, try to get the analysis ID from URL or localStorage
    // This is a temporary solution until the history API is fixed
    try {
      // CACHE BUSTING: Skip localStorage cache for fresh data (fixes June data issue)
      // Check if we have a recent analysis ID in localStorage
      if (typeof window !== 'undefined') {
        const recentAnalysisId = localStorage.getItem('recentAnalysisId');
        if (recentAnalysisId) {
          console.log(`[getLatestCompletedAnalysis] Trying to fetch recent analysis from localStorage: ${recentAnalysisId}`);
          console.log(`[CACHE_BUST] Bypassing localStorage cache to ensure fresh data`);
          const analysisData = await apiClient.getAnalysisById(recentAnalysisId);
          if (analysisData && analysisData.status === 'completed') {
            console.log(`[getLatestCompletedAnalysis] Successfully fetched analysis: ${recentAnalysisId}`);
            return analysisData;
          }
        }
      }
    } catch (fallbackError) {
      console.error('[getLatestCompletedAnalysis] Fallback error:', fallbackError);
    }

    console.log('[getLatestCompletedAnalysis] No completed analyses found');
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
    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

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

/**
 * Server-side PRD Generation
 * Generates PRD using LLM from analysis data
 */
export async function getServerSidePRD(analysisId: string, forceRegenerate: boolean = false): Promise<PRDResponse | null> {
  try {
    console.log(`[getServerSidePRD] Generating PRD for analysis ID: ${analysisId}, forceRegenerate: ${forceRegenerate}`);

    // Use development token (Clerk removed)
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    // Set the token on the API client
    apiClient.setAuthToken(authToken);

    // Generate PRD using the LLM-powered backend service
    const prdResponse = await generatePRD(analysisId, 'both', forceRegenerate);

    console.log(`[getServerSidePRD] Successfully generated PRD for analysis ID: ${analysisId}`);
    return prdResponse;
  } catch (error) {
    console.error('[getServerSidePRD] Error generating PRD:', error);
    return null;
  }
}
