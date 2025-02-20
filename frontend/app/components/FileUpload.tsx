/**
 * Component for handling file uploads.
 */
'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { apiClient } from '@/app/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, UploadCloud } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface FileUploadProps {
  onUploadComplete: (dataId: number) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return await apiClient.uploadData(file)
    },
    onSuccess: (data) => {
      setUploadProgress(100)
      onUploadComplete(data.data_id)
    }
  })

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    // Reset progress
    setUploadProgress(0)

    // Validate file type
    if (file.type !== 'application/json') {
      uploadMutation.error = new Error('Please upload a JSON file')
      return
    }

    // Start upload
    uploadMutation.mutate(file)
  }, [uploadMutation])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json']
    },
    maxFiles: 1
  })

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="p-6">
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors duration-200
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'}
            ${uploadMutation.isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input {...getInputProps()} disabled={uploadMutation.isLoading} />
          
          <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
          
          <div className="mt-4">
            {isDragActive ? (
              <p className="text-sm text-gray-600">Drop the file here...</p>
            ) : (
              <p className="text-sm text-gray-600">
                Drag and drop a JSON file, or click to select
              </p>
            )}
          </div>

          <Button
            className="mt-4"
            disabled={uploadMutation.isLoading}
            variant="outline"
          >
            Select File
          </Button>
        </div>

        {/* Upload Progress */}
        {uploadMutation.isLoading && (
          <div className="mt-4">
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-sm text-gray-600 mt-2">Uploading file...</p>
          </div>
        )}

        {/* Success Message */}
        {uploadMutation.isSuccess && (
          <Alert className="mt-4" variant="default">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>
              File uploaded successfully! You can now proceed with the analysis.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {uploadMutation.isError && (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {uploadMutation.error?.message || 'Failed to upload file. Please try again.'}
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  )
}