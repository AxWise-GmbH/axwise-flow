'use client';

import React, { useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

interface DirectFileUploaderProps {
  onUploadComplete: (dataId: number) => void;
  onError: (error: Error) => void;
  isTextFile: boolean;
  file: File;
}

/**
 * DirectFileUploader component
 *
 * This component handles file uploads directly using XMLHttpRequest,
 * bypassing the Next.js server action to avoid serialization issues.
 */
export function DirectFileUploader({
  onUploadComplete,
  onError,
  isTextFile,
  file
}: DirectFileUploaderProps) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Function to upload the file directly
  const uploadFile = useCallback(async () => {
    if (!file) {
      onError(new Error('No file provided'));
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      // Get the auth token from the API client
      const authToken = apiClient.getAuthToken();

      if (!authToken) {
        throw new Error('Not authenticated');
      }

      // Create a FormData object
      const formData = new FormData();

      // Handle special characters in file name
      let fileToUpload = file;

      // Check if the file name contains problematic characters
      if (/[\u0080-\uFFFF]/.test(file.name)) {
        console.log('Sanitizing file name to prevent encoding issues');

        // Create a sanitized file name by replacing non-ASCII characters
        const sanitizedName = file.name.replace(/[^\x00-\x7F]/g, '_');
        console.log('Sanitized name:', sanitizedName);

        // Create a new File object with the sanitized name
        try {
          const arrayBuffer = await file.arrayBuffer();
          fileToUpload = new File([arrayBuffer], sanitizedName, { type: file.type });
          console.log('Created new file with sanitized name:', sanitizedName, 'Size:', fileToUpload.size);
        } catch (fileError) {
          console.error('Failed to create sanitized file:', fileError);
          // Fall back to original file if this fails
          fileToUpload = file;
        }
      }

      // Add the file to FormData
      formData.append('file', fileToUpload);
      formData.append('is_free_text', String(isTextFile));

      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof XMLHttpRequest === 'undefined') {
        throw new Error('DirectFileUploader can only be used in a browser environment');
      }

      // Create a new XMLHttpRequest
      const xhr = new XMLHttpRequest();

      // Set up progress tracking
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      };

      // Create a promise to handle the XHR response
      const uploadPromise = new Promise<number>((resolve, reject) => {
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response && response.data_id) {
                resolve(response.data_id);
              } else {
                reject(new Error('Invalid response format'));
              }
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${xhr.responseText.substring(0, 100)}`));
            }
          } else {
            let errorMessage = `Upload failed with status: ${xhr.status}`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              if (errorData && errorData.detail) {
                errorMessage = errorData.detail;
              }
            } catch (parseError) {
              // Use the default error message
            }
            reject(new Error(errorMessage));
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error during file upload'));
        };

        xhr.onabort = function() {
          reject(new Error('File upload was aborted'));
        };
      });

      // Open and send the request
      xhr.open('POST', `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/data`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.send(formData);

      // Wait for the upload to complete
      const dataId = await uploadPromise;

      // Call the onUploadComplete callback
      onUploadComplete(dataId);
    } catch (error) {
      console.error('Upload error:', error);
      onError(error instanceof Error ? error : new Error('Unknown upload error'));
    } finally {
      setIsUploading(false);
    }
  }, [file, isTextFile, onUploadComplete, onError]);

  // Start the upload when the component mounts
  React.useEffect(() => {
    uploadFile();
  }, [uploadFile]);

  return (
    <div className="direct-file-uploader">
      {isUploading && (
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
          <div className="progress-text">{progress}%</div>
        </div>
      )}
    </div>
  );
}
