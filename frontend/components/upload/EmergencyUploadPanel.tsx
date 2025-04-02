'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react'; // Removed unused useTransition
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, FileUp, FileText, FilePen, X } from 'lucide-react'; // Removed unused CheckCircle2
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UploadResponse } from '@/types/api';
import { uploadAction, analyzeAction, getRedirectUrl } from '@/app/actions';
import { apiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { setCookie } from 'cookies-next';

/**
 * Emergency UploadPanel Component - Refactored for Server Actions
 * 
 * This component uses React's useState for local state management with
 * Next.js server actions for form submission, eliminating Zustand dependency.
 */
export default function EmergencyUploadPanel() {
  const router = useRouter();
  const { toast } = useToast();
  // const [isPending, startTransition] = useTransition(); // Removed unused variables
  
  // Reference to file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [isTextFile, setIsTextFile] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [analysisError, setAnalysisError] = useState<Error | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [pollingActive, setPollingActive] = useState<boolean>(false);
  
  // Effect to get and set auth token in cookie
  useEffect(() => {
    const storeAuthToken = async () => {
      try {
        // This uses the apiClient's method to get a token from Clerk
        const token = await apiClient.getAuthToken();
        
        if (token) {
          // Store token in a cookie for server actions
          document.cookie = `auth_token=${token}; path=/; max-age=3600; SameSite=Strict`;
          console.log('Auth token stored in cookie for server actions');
        } else {
          console.warn('No auth token available to store in cookie');
        }
      } catch (error) {
        console.error('Error storing auth token:', error);
      }
    };
    
    storeAuthToken();
  }, []);
  
  // Effect to poll for analysis completion
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    if (pollingActive && resultId) {
      // Increase the progress bar during polling to provide visual feedback
      const progressIncrement = setInterval(() => {
        setAnalysisProgress(prev => {
          // Cap at 95% until we confirm completion
          const next = prev + 5;
          return next > 95 ? 95 : next;
        });
      }, 3000);
      
      // Poll for analysis completion every 3 seconds
      pollInterval = setInterval(async () => {
        try {
          const statusResult = await apiClient.checkAnalysisStatus(resultId);
          
          console.log(`Poll status for ${resultId}:`, statusResult.status);
          
          if (statusResult.status === 'completed') {
            // Analysis is complete
            clearInterval(pollInterval!);
            clearInterval(progressIncrement);
            setPollingActive(false);
            setIsAnalyzing(false);
            setAnalysisProgress(100);
            
            toast({
              title: "Analysis completed",
              description: "Redirecting to visualization...",
              variant: "default",
            });
            
            // Redirect after a short delay to show the 100% progress
            setTimeout(async () => {
              const redirectUrl = await getRedirectUrl(resultId);
              router.push(redirectUrl);
            }, 800);
          } else if (statusResult.status === 'failed') {
            // Analysis failed
            clearInterval(pollInterval!);
            clearInterval(progressIncrement);
            setPollingActive(false);
            setIsAnalyzing(false);
            setAnalysisProgress(0);
            
            setAnalysisError(new Error('Analysis failed during processing'));
            toast({
              title: "Analysis failed",
              description: "Analysis failed during processing",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Error polling for analysis status:', error);
        }
      }, 3000);
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollingActive, resultId, router, toast]);
  
  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFile(file);
      setFileName(file.name);
      setFileSize(file.size);
      setIsTextFile(file.type.includes('text') || file.name.endsWith('.txt'));
      
      // Reset states when file changes
      setUploadProgress(0);
      setResultId(null);
      setUploadError(null);
      setAnalysisError(null);
    }
  }, []);
  
  // Handle file upload using server action
  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError(new Error('Please select a file to upload'));
      toast({
        title: "Upload failed",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);
    
    try {
      console.log('Starting upload with server action...');
      
      // Store auth token in cookie for server action
      const authToken = await apiClient.getAuthToken();
      if (authToken) {
        setCookie('auth-token', authToken);
      }

      // Create form data for server action
      const formData = new FormData();
      formData.append('file', file);
      formData.append('isTextFile', String(isTextFile));
      
      // Call the server action
      const result = await uploadAction(formData);
      
      if (result.success && result.uploadResponse) {
        setUploadProgress(100);
        setUploadResponse(result.uploadResponse);
        toast({
          title: "Upload successful",
          description: `File ${fileName} uploaded successfully.`,
          variant: "default",
        });
        
        // Start analysis
        await handleAnalysis(result.uploadResponse.data_id);
      } else {
        // Handle error from server action
        const errorMessage = result.error || 'Upload failed';
        setUploadError(new Error(errorMessage));
        toast({
          title: "Upload failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      
      setUploadError(error instanceof Error ? error : new Error('Unknown upload error'));
      
      // Show a more user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [file, isTextFile, toast, router]);
  
  // Handle analysis using server action
  const handleAnalysis = useCallback(async (dataId: number) => {
    if (!file) {
      setAnalysisError(new Error('Please upload a file first'));
      toast({
        title: "Analysis failed",
        description: "Please upload a file first",
        variant: "destructive",
      });
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(10); // Start progress at 10%
    
    try {
      console.log('Starting analysis with server action...');
      
      // Call the analyze action with the isTextFile parameter
      const result = await analyzeAction(dataId, isTextFile);
      
      if (result.success && result.analysisResponse) {
        const analysisId = result.analysisResponse.result_id.toString();
        setResultId(analysisId);
        
        // Start polling for completion instead of immediate redirect
        setPollingActive(true);
        setAnalysisProgress(30); // Set to 30% after initial response
        
        toast({
          title: "Analysis started",
          description: "Analysis started successfully. This may take a few moments...",
          variant: "default",
        });
      } else {
        // Handle error from server action
        const errorMessage = result.error || 'Analysis failed';
        setAnalysisError(new Error(errorMessage));
        toast({
          title: "Analysis failed",
          description: errorMessage,
          variant: "destructive",
        });
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      
      setAnalysisError(error instanceof Error ? error : new Error('Unknown analysis error'));
      
      // Show a more user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown analysis error';
      toast({
        title: "Analysis failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsAnalyzing(false);
    }
  }, [file, isTextFile, toast]);
  
  // Trigger file input click
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Handle clear file
  const handleClearFile = useCallback(() => {
    setFile(null);
    setFileName('');
    setFileSize(0);
    setUploadProgress(0);
    setResultId(null);
    setUploadError(null);
    setAnalysisError(null);
    
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);
  
  // Toggle text file setting
  const handleToggleTextFile = useCallback((value: string) => {
    const isText = value === 'text';
    setIsTextFile(isText);
  }, []);
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload Data for Analysis</CardTitle>
        <CardDescription>
          Upload a file to analyze with design thinking frameworks.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* File Type Selection */}
          <div className="mb-4">
            <Label htmlFor="data-type" className="mb-2 block">Data Type</Label>
            <RadioGroup 
              defaultValue={isTextFile ? 'text' : 'structured'} 
              onValueChange={handleToggleTextFile}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="structured" id="structured" />
                <Label htmlFor="structured">Structured Data (CSV, Excel)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" />
                <Label htmlFor="text">Free Text</Label>
              </div>
            </RadioGroup>
          </div>
          
          {/* File Upload Area */}
          <div 
            className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={handleSelectFileClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              data-testid="file-input" // Add test ID
              className="hidden"
              onChange={handleFileChange}
              accept={isTextFile ? ".txt,.md,.doc,.docx" : ".csv,.xlsx,.xls,.json"}
            />
            
            {!fileName ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <FileUp className="h-10 w-10 mb-2" />
                <p className="text-sm mb-1">Click to upload or drag and drop</p>
                <p className="text-xs">
                  {isTextFile ? 
                    "TXT, DOC, DOCX or MD files" : 
                    "CSV, XLSX or JSON files"}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {isTextFile ? <FileText className="h-8 w-8 mr-2" /> : <FilePen className="h-8 w-8 mr-2" />}
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearFile();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Error message */}
          {uploadError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {uploadError.message}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Analysis error message */}
          {analysisError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {analysisError.message}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Upload progress */}
          {isUploading && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Uploading...</span>
                <span>Please wait</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
          
          {/* Analysis progress */}
          {isAnalyzing && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Analyzing...</span>
                <span>{analysisProgress < 100 ? 'This may take a moment' : 'Redirecting...'}</span>
              </div>
              <Progress value={analysisProgress} className="h-2" />
              <div className="text-right text-xs text-muted-foreground">
                {analysisProgress}%
              </div>
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={handleClearFile}
          disabled={isUploading || isAnalyzing || !fileName}
        >
          Clear
        </Button>
        <div className="space-x-2">
          <Button
            variant="secondary"
            onClick={handleUpload}
            disabled={isUploading || isAnalyzing || !fileName}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>
          <Button
            onClick={() => handleAnalysis(uploadResponse?.data_id || 0)}
            disabled={isUploading || isAnalyzing || !file}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
