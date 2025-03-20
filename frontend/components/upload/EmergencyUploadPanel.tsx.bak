import React, { useRef, useState, useCallback } from 'react';
import { useUploadStore } from '@/store/useUploadStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileText, Upload, Sparkles } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * Emergency UploadPanel Component (Loop-Free Version)
 * 
 * This component completely bypasses Zustand subscription mechanisms
 * that were causing infinite loops and instead uses React's useState
 * for local state management with manual synchronization to the store.
 */
export default function EmergencyUploadPanel() {
  // React local state instead of Zustand subscriptions
  const [file, setLocalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [analysisError, setAnalysisError] = useState<Error | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [llmProvider, setLocalLlmProvider] = useState<'openai' | 'gemini'>('openai');
  
  // Direct store access (no subscriptions)
  const store = useUploadStore.getState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  
  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setLocalFile(selectedFile);
      setFileName(selectedFile.name);
      setFileSize(selectedFile.size);
      setUploadComplete(false);
      setAnalysisComplete(false);
      setResultId(null);
      
      // Manual store update without subscription
      useUploadStore.setState(state => ({
        ...state,
        file: {
          ...selectedFile,
          id: crypto.randomUUID(),
          status: 'uploading',
          progress: 0
        },
        uploadResponse: null,
        analysisResponse: null,
        uploadError: null,
        analysisError: null
      }));
    }
  }, []);
  
  // Handle file upload
  const handleUpload = useCallback(async () => {
    if (!file) {
      showToast('Please select a file to upload', { variant: 'error' });
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      // Call the store method directly without subscription
      const response = await store.uploadFile();
      setUploadComplete(true);
      if (response) {
        showToast('File uploaded successfully', { variant: 'success' });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error : new Error('Unknown upload error'));
      showToast('Upload failed', { variant: 'error' });
    } finally {
      setIsUploading(false);
    }
  }, [file, showToast, store]);
  
  // Handle analysis start
  const handleStartAnalysis = useCallback(async () => {
    if (!uploadComplete) {
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      // Call the store method directly without subscription
      const response = await store.startAnalysis();
      if (response) {
        setAnalysisComplete(true);
        // Fix: Convert number to string to match state type
        setResultId(response.result_id.toString());
        showToast('Analysis started successfully', { variant: 'success' });
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error : new Error('Unknown analysis error'));
      showToast('Analysis failed', { variant: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  }, [uploadComplete, showToast, store]);
  
  // Trigger file input click
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Handle clear file
  const handleClearFile = useCallback(() => {
    setLocalFile(null);
    setFileName('');
    setFileSize(0);
    setUploadComplete(false);
    setAnalysisComplete(false);
    setResultId(null);
    setUploadError(null);
    setAnalysisError(null);
    
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Manual store update without subscription
    useUploadStore.setState(state => ({
      ...state,
      file: undefined,
      uploadResponse: null,
      analysisResponse: null,
      uploadError: null,
      analysisError: null
    }));
  }, []);
  
  // Handle LLM provider change
  const handleLlmProviderChange = useCallback((value: string) => {
    const provider = value as 'openai' | 'gemini';
    setLocalLlmProvider(provider);
    
    // Manual store update without subscription
    useUploadStore.setState(state => ({
      ...state,
      llmProvider: provider
    }));
  }, []);
  
  // Calculate file size in KB
  const fileSizeKB = fileSize > 0 ? (fileSize / 1024).toFixed(2) : '0';
  
  // Format file type (simple check)
  const isTextFile = file?.type?.includes('text') || fileName.endsWith('.txt') || fileName.endsWith('.text');
  
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
              disabled={isUploading}
            >
              <FileText className="mr-2 h-4 w-4" />
              {file ? 'Change File' : 'Select File'}
            </Button>
            
            {file && (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handleClearFile}
                disabled={isUploading}
              >
                Clear
              </Button>
            )}
          </div>
          
          {/* File Details */}
          {file && (
            <div className="bg-muted p-3 rounded-md">
              <p className="font-medium">{fileName}</p>
              <p className="text-sm text-muted-foreground">
                {isTextFile ? 'Text file' : 'JSON file'} - {fileSizeKB} KB
              </p>
            </div>
          )}
          
          {/* Upload Error */}
          {uploadError && (
            <Alert variant="destructive">
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription>{uploadError.message}</AlertDescription>
            </Alert>
          )}
        </div>
        
        {/* LLM Provider Selection */}
        <div className="space-y-3">
          <Label htmlFor="llm-provider">LLM Provider</Label>
          <RadioGroup 
            id="llm-provider" 
            value={llmProvider} 
            onValueChange={handleLlmProviderChange}
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
          disabled={!file || isUploading || uploadComplete}
          className="w-full"
        >
          {isUploading ? (
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
        {uploadComplete && !analysisComplete && (
          <Button 
            onClick={handleStartAnalysis} 
            disabled={isAnalyzing}
            className="w-full"
            variant="secondary"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Analysis...
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
        {analysisError && (
          <Alert variant="destructive">
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription>{analysisError.message}</AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
}
