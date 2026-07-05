'use client'

import React from 'react' // Removed unused useState
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { FileUpload } from '@/components/FileUpload'
import { useRouter } from 'next/navigation'

export default function UploadPage(): JSX.Element { // Add return type
  const router = useRouter();

  const handleUploadComplete = (dataId: number): void => { // Add return type
    console.log(`Upload completed. Data ID: ${dataId}`);
    
    // After successful upload, redirect to analysis page
    setTimeout(() => {
      router.push(`/unified-dashboard?analysisId=${dataId}&tab=visualize`);
    }, 1500); // Small delay to show success message
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Interview Data</CardTitle>
          <CardDescription>
            Upload your interview data in JSON or text format to begin analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload 
            onUploadComplete={handleUploadComplete} 
            autoUpload={true}
            showCard={false}
          />
        </CardContent>
      </Card>
    </div>
  )
}