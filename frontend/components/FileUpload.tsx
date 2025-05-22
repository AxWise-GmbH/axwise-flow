/**
 * Consolidated FileUpload component
 * Combines features from all implementations with enhanced functionality
 */
'use client'

import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useCallback, useState, useEffect } from 'react'
import { apiClient } from '@/lib/apiClient'
import { AlertCircle, CheckCircle2, FileUp } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { useFileContentCheck } from '@/hooks/useFileContentCheck'
import { DirectFileUploader } from '@/components/DirectFileUploader'
import {
  isFileUploadSupported,
  createSanitizedFile,
  getPendingUpload,
  savePendingUpload,
  clearPendingUpload
} from '@/utils/fileUpload'

interface FileUploadProps {
  onUploadComplete?: (dataId: number) => void;
  onFileChange?: (file: File, isTextFile: boolean) => void;
  className?: string;
  file?: File | null;
  showFileDetails?: boolean;
  autoUpload?: boolean;
  showCard?: boolean;
  title?: string;
  description?: string;
  maxSizeMB?: number;
}

/**
 * FileUpload component that handles file upload functionality
 *
 * Features:
 * - Drag and drop support
 * - Progress tracking
 * - File validation (JSON and TXT)
 * - Error and success states
 * - File details display
 * - Configurable UI and behavior
 */
export function FileUpload({
  onUploadComplete,
  onFileChange,
  file: externalFile,
  className = '',
  showFileDetails = true,
  autoUpload = false,
  showCard = true,
  title,
  description,
  maxSizeMB = 10
}: FileUploadProps): JSX.Element {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<Error | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [isDraggingLocal, setIsDraggingLocal] = useState(false)
  const [internalFile, setInternalFile] = useState<File | null>(null)

  // Use external file if provided, otherwise use internal state
  const file = externalFile !== undefined ? externalFile : internalFile;

  // Maximum file size in bytes
  const maxFileSize = maxSizeMB * 1024 * 1024;

  const uploadFile = useCallback(async (file: File) => {
    // Validate file type
    if (
      file.type !== 'application/json' &&
      file.type !== 'text/plain' &&
      !file.name.endsWith('.json') &&
      !file.name.endsWith('.txt')
    ) {
      setUploadError(new Error('Please upload a JSON or TXT file'))
      return
    }

    // Validate file size
    if (file.size > maxFileSize) {
      setUploadError(new Error(`File size exceeds ${maxSizeMB}MB limit`))
      return
    }

    const isTextFile = file.type === 'text/plain' || file.name.endsWith('.txt')

    // If we're just reporting the file change without uploading
    if (onFileChange) {
      onFileChange(file, isTextFile)
      // If not auto-uploading, return early
      if (!autoUpload || !onUploadComplete) {
        return
      }
    }

    // Only proceed with upload if onUploadComplete is provided
    if (!onUploadComplete) {
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadSuccess(false)

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 5, 95))
    }, 100)

    try {
      // Check if we're in a browser or server environment
      if (typeof window !== 'undefined') {
        try {
          // We're in the browser, use the direct uploader
          console.log('Using client-side upload approach');

          // Create a FormData object for the upload
          const formData = new FormData();
          formData.append('file', file);
          formData.append('isTextFile', String(isTextFile));

          // Import the server action for SSR
          const { uploadAction } = await import('@/app/actions');

          // Call the server action directly - it will use XMLHttpRequest in browser context
          const result = await uploadAction(formData);

          clearInterval(progressInterval);
          setUploadProgress(100);

          if (result.success) {
            setUploadSuccess(true);
            setIsUploading(false);
            onUploadComplete(result.uploadResponse.data_id);
          } else {
            throw new Error(result.error);
          }
        } catch (clientError) {
          console.error('Client-side upload failed, trying fallback approach:', clientError);

          // If the first approach fails, try using the DirectFileUploader component
          try {
            // Create a temporary DOM element to mount the DirectFileUploader
            const tempDiv = document.createElement('div');
            document.body.appendChild(tempDiv);

            // Create a promise that will be resolved when the upload completes
            const uploadPromise = new Promise<number>((resolve, reject) => {
              // Render the DirectFileUploader component
              const cleanup = () => {
                // Remove the temporary element when done
                if (tempDiv.parentNode) {
                  document.body.removeChild(tempDiv);
                }
              };

              // Define the callbacks
              const handleUploadComplete = (dataId: number) => {
                cleanup();
                resolve(dataId);
              };

              const handleError = (error: Error) => {
                cleanup();
                reject(error);
              };

              // Use dynamic import for react-dom/client to avoid SSR issues
              import('react-dom/client').then(({ createRoot }) => {
                const root = createRoot(tempDiv);
                root.render(
                  <DirectFileUploader
                    file={file}
                    isTextFile={isTextFile}
                    onUploadComplete={handleUploadComplete}
                    onError={handleError}
                  />
                );
              }).catch(importError => {
                cleanup();
                reject(new Error(`Failed to import react-dom/client: ${importError.message}`));
              });
            });

            // Wait for the upload to complete
            const dataId = await uploadPromise;

            // Update UI
            clearInterval(progressInterval);
            setUploadProgress(100);
            setUploadSuccess(true);
            setIsUploading(false);
            onUploadComplete(dataId);
          } catch (fallbackError) {
            console.error('Fallback upload approach also failed:', fallbackError);
            throw fallbackError;
          }
        }
      } else {
        // We're on the server, inform the user that server-side upload is not supported
        console.log('Server-side rendering detected, deferring upload to client');

        // Clear the progress interval
        clearInterval(progressInterval);

        // Set a special error message
        setUploadError(new Error(
          'File upload is not supported during server-side rendering. Please refresh the page and try again.'
        ));

        setIsUploading(false);

        // Store the file information in sessionStorage to retry on client side
        savePendingUpload(file, isTextFile);

        return; // Exit early, don't attempt server-side upload
      }
    } catch (error) {
      clearInterval(progressInterval)
      setUploadError(error instanceof Error ? error : new Error('Failed to upload file'))
      setIsUploading(false)
    }
  }, [onUploadComplete, onFileChange, autoUpload, maxFileSize, maxSizeMB])

  // Get the file content check hook
  const { checkFileForEncodingIssues } = useFileContentCheck();

  // Handle file drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setInternalFile(file)

      // Check for encoding issues in the file content (client-side only)
      try {
        await checkFileForEncodingIssues(file);
      } catch (error) {
        console.error('Error checking file for encoding issues:', error);
        // Continue with upload even if encoding check fails
      }

      await uploadFile(file)
    }
  }, [uploadFile, checkFileForEncodingIssues])

  // Initialize dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
  })

  // Ensure isDragActive state is always synced
  useEffect(() => {
    setIsDraggingLocal(isDragActive)
  }, [isDragActive])

  // Check for pending uploads from server-side rendering
  useEffect(() => {
    const pendingUpload = getPendingUpload();

    if (pendingUpload) {
      console.log('Found pending upload from server-side rendering:', pendingUpload);

      // Show a message to the user
      setUploadError(new Error(
        'A previous upload attempt was interrupted. Please select the file again to retry.'
      ));

      // Clear the pending upload
      clearPendingUpload();
    }
  }, [])

  // Event handlers to ensure drag events work in tests
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingLocal(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingLocal(false)
  }, [])

  // Special handler for tests - allows direct file upload triggering
  const handleTestUpload = useCallback(async (file: File) => {
    await uploadFile(file)
  }, [uploadFile])

  // Expose methods for testing
  React.useImperativeHandle(
    React.createRef(),
    () => ({
      testUploadFile: handleTestUpload,
      testSetError: (error: Error) => setUploadError(error),
      testSetUploading: (state: boolean) => setIsUploading(state),
    }),
    [handleTestUpload]
  )

  // Build the content for the component
  const renderContent = (): JSX.Element => ( // Add return type
    <>
      {/* Optional title and description */}
      {(title || description) && (
        <div className="flex flex-col space-y-2 mb-4">
          {title && <Label htmlFor="file-upload">{title}</Label>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDraggingLocal || isDragActive ? 'border-primary bg-primary/5' : 'border-muted'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        data-testid="dropzone"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        <input {...getInputProps()} disabled={isUploading} data-testid="file-input" id="file-upload" />

        <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />

        <div className="mt-4">
          {isDraggingLocal || isDragActive ? (
            <p className="text-sm text-muted-foreground" data-testid="drop-message">Drop the file here...</p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="upload-message">
              Drag and drop a JSON or TXT file, or click to select
            </p>
          )}
        </div>

        <Button
          className="mt-4"
          disabled={isUploading}
          variant="outline"
        >
          Select File
        </Button>
      </div>

      {/* File details when a file is selected */}
      {file && showFileDetails && (
        <div className="text-sm flex items-center justify-between mt-4">
          <span>Selected file: <strong>{file.name}</strong></span>
          <span className="text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mt-4 space-y-2" data-testid="upload-progress">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-muted-foreground">
            Uploading file... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Success Message */}
      {uploadSuccess && (
        <Alert className="mt-4" variant="default" data-testid="success-message">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            File uploaded successfully! You can now proceed with the analysis.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {uploadError && (
        <Alert className="mt-4" variant="destructive" data-testid="error-message">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {uploadError.message || 'Failed to upload file. Please try again.'}
          </AlertDescription>
        </Alert>
      )}
    </>
  )

  // If showCard is true, wrap content in a Card, otherwise return content directly
  return showCard ? (
    <Card className={`p-6 ${className}`}>
      {renderContent()}
    </Card>
  ) : (
    <div className={className}>
      {renderContent()}
    </div>
  )
}
