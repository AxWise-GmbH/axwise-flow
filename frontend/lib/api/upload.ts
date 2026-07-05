/**
 * File upload methods for the API client
 */

import { apiCore } from './core';
import { UploadResponse } from './types';

/**
 * Upload data to the API
 *
 * @param file The file to upload
 * @param isTextFile Whether the file is a text file (default: false)
 * @returns A promise that resolves to the upload response
 */
export async function uploadData(file: File, isTextFile: boolean = false): Promise<UploadResponse> {
  try {
    // Log the request data for debugging
    console.log('Uploading file:', {
      filename: file.name,
      type: file.type,
      size: file.size,
      isTextFile
    });

    const formData = new FormData();

    // Ensure the file is properly appended with the correct field name
    // FastAPI expects the field name to match the parameter name in the endpoint
    formData.append('file', file, file.name);

    // Convert boolean to string representation expected by the backend
    formData.append('is_free_text', String(isTextFile));

    // Log the FormData contents for debugging
    console.log('FormData entries:');
    for (const pair of formData.entries()) {
      console.log(`${pair[0]}: ${pair[1]}`);
    }

    // Important: Do NOT set Content-Type header for multipart/form-data
    // The browser will automatically set the correct Content-Type with boundary
    // Use the frontend API route which handles Clerk authentication properly
    const response = await apiCore.getClient().post<UploadResponse>('/api/upload', formData, {
      headers: {
        'Accept': 'application/json',
      },
      // Increase timeout significantly for potentially large files and initial processing
      timeout: 180000, // 180 seconds (increased from 60)
    });

    console.log('Upload response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error uploading data:', error);

    // Enhanced error debugging
    if (error?.response?.data) {
      console.error('Server error response:', error.response.data);

      if (error.response.data.detail) {
        console.error('Server error details:', error.response.data.detail);

        // If it's a validation error array, log each error
        if (Array.isArray(error.response.data.detail)) {
          error.response.data.detail.forEach((err: any, index: number) => {
            console.error(`Validation error ${index + 1}:`, err);
          });
        }
      }
    }

    // Log request details that might be helpful
    console.error('Request config:', {
      url: error?.config?.url,
      method: error?.config?.method,
      headers: error?.config?.headers,
      data: error?.config?.data
    });

    // Handle different error types safely
    if (error && error.response) {
      // Handle 401 separately as it's typically an auth issue
      if (error.response.status === 401) {
        throw new Error('Authentication required. Please log in.');
      }

      // Handle 422 errors specifically for better feedback
      if (error.response.status === 422) {
        const errorDetail = error.response.data?.detail;
        if (Array.isArray(errorDetail) && errorDetail.length > 0) {
          // Handle FastAPI validation error format
          const validationErrors = errorDetail.map((err: any) =>
            `${err.loc.join('.')}: ${err.msg}`
          ).join(', ');
          throw new Error(`Validation error: ${validationErrors}`);
        } else if (typeof errorDetail === 'string') {
          throw new Error(`Validation error: ${errorDetail}`);
        } else {
          throw new Error('The server could not process your request. Please check your file format.');
        }
      }

      // Use the server error message if available
      const errorResponse = error.response.data as { detail?: string };
      if (errorResponse?.detail) {
        throw new Error(errorResponse.detail);
      }
    }

    // Generic error with a safe message access
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : 'Unknown error';
    throw new Error(`Upload failed: ${errorMessage}`);
  }
}
