'use client'

import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useCallback, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { AlertCircle, CheckCircle2, UploadCloud } from 'lucide-react'
import type { UploadResponse } from '@/types/api'

interface FileUploadProps {
  onUploadComplete: (dataId: number) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps): JSX.Element {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<Error | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // Set auth token once during component initialization
  React.useEffect(() => apiClient.setAuthToken("test-token"), [])

  const uploadFile = async (file: File) => {
    if (file.type !== 'application/json') {
      setUploadError(new Error('Please upload a JSON file'))
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadSuccess(false)

    try {
      const reader = new FileReader()
      reader.readAsArrayBuffer(file)

      const uploadResponse = await new Promise<UploadResponse>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const response = await apiClient.uploadData(file)
            setUploadProgress(100)
            resolve(response)
          } catch (error) {
            reject(error)
          }
        }
        reader.onerror = () => reject(reader.error)
      })

      setUploadSuccess(true)
      setIsUploading(false)
      onUploadComplete(uploadResponse.data_id)
    } catch (error) {
      setUploadError(error instanceof Error ? error : new Error('Failed to upload file'))
      setIsUploading(false)
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) uploadFile(acceptedFiles[0])
    },
    [uploadFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    maxFiles: 1,
  })

  return (
    <Card className="p-6">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} disabled={isUploading} />

        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />

        <div className="mt-4">
          {isDragActive ? (
            <p className="text-sm text-muted-foreground">Drop the file here...</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Drag and drop a JSON file, or click to select
            </p>
          )}
        </div>

        <button
          className="mt-4 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          disabled={isUploading}
          type="button"
        >
          Select File
        </button>
      </div>

      {isUploading && (
        <div className="mt-4 space-y-2">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-muted-foreground">
            Uploading file... {uploadProgress}%
          </p>
        </div>
      )}

      {uploadSuccess && (
        <div className="mt-4 p-4 bg-primary/10 text-primary rounded-md flex items-center">
          <CheckCircle2 className="h-5 w-5 mr-2" />
          <p>File uploaded successfully!</p>
        </div>
      )}

      {uploadError && (
        <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-md flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          <p>
            {uploadError.message || 'Failed to upload file'}
          </p>
        </div>
      )}
    </Card>
  )
}