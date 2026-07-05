'use client';

import React, { useRef, useCallback, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileText, Upload, Sparkles } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { uploadAction, analyzeAction, getRedirectUrl } from '@/app/actions';
import { useRouter } from 'next/navigation';

// Types
interface FileMetadata {
  isTextFile: boolean;
  filePreview?: string;
}

/**
 * UploadPanel Component (Server Action Version)
 * Handles file selection, upload, and analysis initiation using server actions
 */
export default function UploadPanelServerAction() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  // Local state for file and status
  const [file, setFileState] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata>({ isTextFile: false });
  const [uploadStatus, setUploadStatus] = useState<{
    isUploading: boolean;
    uploadResponse?: { data_id: number; filename: string; } | null;
    uploadError?: Error | null;
  }>({
    isUploading: false,
    uploadResponse: null,
    uploadError: null
  });
  
  const [analysisStatus, setAnalysisStatus] = useState<{
    isAnalyzing: boolean;
    analysisResponse?: { result_id: number } | null;
    analysisError?: Error | null;
  }>({
    isAnalyzing: false,
    analysisResponse: null,
    analysisError: null
  });
  
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini'>('gemini');
  
  // Handle file selection
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFileState(selectedFile);
      
      // Determine if it's a text file
      const isTextFile = selectedFile.type === 'text/plain' || 
                        selectedFile.name.endsWith('.txt') || 
                        selectedFile.name.endsWith('.text');
      
      // Generate preview for text files
      let preview = undefined;
      if (isTextFile) {
        try {
          const text = await selectedFile.text();
          preview = text.slice(0, 200) + (text.length > 200 ? '...' : '');
        } catch (error) {
          console.error('Error reading file preview:', error);
        }
      }
      
      setMetadata({
        isTextFile,
        filePreview: preview
      });
    }
  }, []);
  
  // Handle file upload using server action
  const handleUpload = useCallback(async () => {
    if (!file) {
      showToast('Please select a file to upload', { variant: 'error' });
      return;
    }
    
    setUploadStatus({
      isUploading: true,
      uploadResponse: null,
      uploadError: null
    });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('isTextFile', metadata.isTextFile.toString());
      
      const result = await uploadAction(formData);
      
      if (result.success) {
        setUploadStatus({
          isUploading: false,
          uploadResponse: result.uploadResponse,
          uploadError: null
        });
        showToast('File uploaded successfully', { variant: 'success' });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setUploadStatus({
        isUploading: false,
        uploadResponse: null,
        uploadError: error instanceof Error ? error : new Error('Unknown upload error')
      });
      showToast('Upload failed', { variant: 'error' });
    }
  }, [file, metadata.isTextFile, showToast]);
  
  // Handle analysis start using server action
  const handleStartAnalysis = useCallback(async () => {
    if (!uploadStatus.uploadResponse) {
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }
    
    setAnalysisStatus({
      isAnalyzing: true,
      analysisResponse: null,
      analysisError: null
    });
    
    try {
      const result = await analyzeAction(
        uploadStatus.uploadResponse.data_id,
        metadata.isTextFile,
        llmProvider
      );
      
      if (result.success && result.analysisResponse) {
        setAnalysisStatus({
          isAnalyzing: false,
          analysisResponse: result.analysisResponse,
          analysisError: null
        });
        showToast('Analysis started successfully', { variant: 'success' });
        
        // Redirect to results page
        if (result.analysisResponse.result_id) {
          startTransition(async () => {
            const redirectUrl = await getRedirectUrl(result.analysisResponse.result_id.toString());
            router.push(redirectUrl);
          });
        }
      } else {
        throw new Error(result.error || 'Analysis failed without specific error');
      }
    } catch (error) {
      setAnalysisStatus({
        isAnalyzing: false,
        analysisResponse: null,
        analysisError: error instanceof Error ? error : new Error('Unknown analysis error')
      });
      showToast('Analysis failed', { variant: 'error' });
    }
  }, [uploadStatus.uploadResponse, metadata.isTextFile, llmProvider, showToast, router]);
  
  // Trigger file input click
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Handle clear file
  const handleClearFile = useCallback(() => {
    setFileState(null);
    setMetadata({ isTextFile: false });
    
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Upload Interview Data</CardTitle>
        <CardDescription>
          Upload your interview transcript file to analyze themes, patterns, and sentiment.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* File Input Section */}
        <div className="space-y-4">
          <Label htmlFor="file-upload">Select Interview File</Label>
          
          <div className="flex items-center space-x-4">
            <Input
              ref={fileInputRef}
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".txt,.text,.json"
            />
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleSelectFileClick}
              className="flex-1"
              disabled={uploadStatus.isUploading}
            >
              <FileText className="mr-2 h-4 w-4" />
              {file ? 'Change File' : 'Select File'}
            </Button>
            
            {file && (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handleClearFile}
                disabled={uploadStatus.isUploading}
              >
                Clear
              </Button>
            )}
          </div>
          
          {/* File Details */}
          {file && (
            <div className="bg-muted p-3 rounded-md">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {metadata.isTextFile ? 'Text file' : 'JSON file'} - {(file.size / 1024).toFixed(2)} KB
              </p>
              
              {/* Text Preview for text files */}
              {metadata.isTextFile && metadata.filePreview && (
                <div className="mt-2">
                  <Label className="text-xs">Preview:</Label>
                  <div className="bg-background p-2 rounded text-xs mt-1 max-h-20 overflow-y-auto">
                    {metadata.filePreview}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Upload Error */}
          {uploadStatus.uploadError && (
            <Alert variant="destructive">
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription>{uploadStatus.uploadError.message}</AlertDescription>
            </Alert>
          )}
        </div>
        
        {/* LLM Provider Selection */}
        <div className="space-y-3">
          <Label htmlFor="llm-provider">LLM Provider</Label>
          <RadioGroup 
            id="llm-provider" 
            value={llmProvider} 
            onValueChange={(value) => setLlmProvider(value as 'openai' | 'gemini')}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="openai" id="openai" />
              <Label htmlFor="openai">OpenAI</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="gemini" id="gemini" />
              <Label htmlFor="gemini">Gemini</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-4">
        {/* Upload Button */}
        <Button 
          onClick={handleUpload} 
          disabled={!file || uploadStatus.isUploading || !!uploadStatus.uploadResponse || isPending}
          className="w-full"
        >
          {uploadStatus.isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </>
          )}
        </Button>
        
        {/* Analysis Button - Only show when upload is complete */}
        {uploadStatus.uploadResponse && !analysisStatus.analysisResponse && (
          <Button 
            onClick={handleStartAnalysis} 
            disabled={analysisStatus.isAnalyzing || isPending}
            className="w-full"
            variant="secondary"
          >
            {analysisStatus.isAnalyzing || isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isPending ? 'Redirecting...' : 'Starting Analysis...'}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Start Analysis
              </>
            )}
          </Button>
        )}
        
        {/* Analysis Error */}
        {analysisStatus.analysisError && (
          <Alert variant="destructive">
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription>{analysisStatus.analysisError.message}</AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
} 