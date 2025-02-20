'use client'

import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { AlertCircle, CheckCircle2, UploadCloud } from 'lucide-react'

interface FileUploadProps {
  onUploadComplete: (dataId: number) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadProgress(0)
      const chunkSize = 1024 * 1024 // 1MB chunks
      const totalSize = file.size
      let uploadedSize = 0

      const reader = new FileReader()
      reader.readAsArrayBuffer(file)

      await new Promise((resolve, reject) => {
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

      return await apiClient.uploadData(file)
    },
    onSuccess: (data) => {
      onUploadComplete(data.data_id)
    },
  })

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return

      if (file.type !== 'application/json') {
        uploadMutation.error = new Error('Please upload a JSON file')
        return
      }

      uploadMutation.mutate(file)
    },
    [uploadMutation]
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
          ${uploadMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} disabled={uploadMutation.isPending} />

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

        <Button
          className="mt-4"
          disabled={uploadMutation.isPending}
          variant="outline"
        >
          Select File
        </Button>
      </div>

      {uploadMutation.isPending && (
        <div className="mt-4 space-y-2">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-muted-foreground">
            Uploading file... {uploadProgress}%
          </p>
        </div>
      )}

      {uploadMutation.isSuccess && (
        <div className="mt-4 p-4 bg-primary/10 text-primary rounded-md flex items-center">
          <CheckCircle2 className="h-5 w-5 mr-2" />
          <p>File uploaded successfully!</p>
        </div>
      )}

      {uploadMutation.isError && (
        <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-md flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          <p>
            {uploadMutation.error instanceof Error
              ? uploadMutation.error.message
              : 'Failed to upload file'}
          </p>
        </div>
      )}
    </Card>
  )
}