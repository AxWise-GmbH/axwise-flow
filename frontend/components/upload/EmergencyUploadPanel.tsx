'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, FileUp, FileText, FilePen, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UploadResponse, AnalysisResponse } from '@/types/api'; // Added AnalysisResponse
import { uploadAction, analyzeAction, getRedirectUrl } from '@/app/actions';
import { usePolling } from '@/hooks/usePolling'; // Import the new hook
import { apiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { setCookie } from 'cookies-next';

/**
 * Emergency UploadPanel Component - Refactored for Server Actions and Polling Hook
 *
 * This component uses React's useState for local state management with
 * Next.js server actions for form submission and a custom hook for polling analysis status.
 */
export default function EmergencyUploadPanel() {
  const router = useRouter();
  const { toast } = useToast();

  // Reference to file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [isTextFile, setIsTextFile] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false); // Tracks if analysis *initiation* is in progress or polling is active
  const [uploadError, setUploadError] = useState<string | null>(null); // Changed to string
  const [analysisError, setAnalysisError] = useState<string | null>(null); // Store error message string
  const [analysisResultId, setAnalysisResultId] = useState<string | null>(null); // Renamed from resultId
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null); // Added status state

  // Effect to get and set auth token in cookie
  useEffect(() => {
    const storeAuthToken = async () => {
      try {
        const token = await apiClient.getAuthToken();
        if (token) {
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

  // --- Polling Hook Setup (Define before handlers that use it) ---
  const { startPolling, stopPolling, isPolling } = usePolling< {
    status: 'pending' | 'completed' | 'failed';
    analysis?: any; // Optional analysis data if needed on completion
    error?: string; // Optional error message
  }>({
    fetchFn: apiClient.checkAnalysisStatus,
    interval: 3000, // Poll every 3 seconds
    stopCondition: (statusResult) =>
      statusResult.status === 'completed' || statusResult.status === 'failed',
    onSuccess: (statusResult) => {
      console.log(`[Polling Success] Status for ${analysisResultId}:`, statusResult.status);
      setAnalysisStatus(statusResult.status); // Update status state

      if (statusResult.status === 'completed') {
        setIsAnalyzing(false); // Analysis/Polling is finished
        setAnalysisProgress(100);
        toast({
          title: "Analysis completed",
          description: "Redirecting to visualization...",
          variant: "default",
        });
        // Redirect after a short delay
        setTimeout(async () => {
          if (analysisResultId) { // Ensure ID is still valid
            const redirectUrl = await getRedirectUrl(analysisResultId);
            router.push(redirectUrl);
          }
        }, 800);
      } else if (statusResult.status === 'failed') {
        setIsAnalyzing(false); // Analysis/Polling is finished
        setAnalysisProgress(0);
        const errorMsg = statusResult.error || 'Analysis failed during processing';
        setAnalysisError(errorMsg);
        toast({
          title: "Analysis failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
      // Note: Progress bar increment logic needs to be handled separately if desired during polling
    },
    onError: (error) => {
      console.error('[Polling Error] Error polling for analysis status:', error);
      // Set error state and show toast on polling fetch error
      const errorMsg = error instanceof Error ? error.message : 'Polling fetch failed';
      setAnalysisError(errorMsg);
      toast({ title: "Polling Error", description: errorMsg, variant: "destructive" });
      // Stop polling and analysis indication on error
      stopPolling(); 
      setIsAnalyzing(false);
      // Decide if polling should stop on error or continue retrying
      // For now, let it retry. If stopping is desired:
      // stopPolling();
      // setIsAnalyzing(false);
      // setAnalysisError('Polling failed: ' + error.message);
      // toast({ title: "Polling Error", description: error.message, variant: "destructive" });
    },
  });

  // --- Callback Handlers ---

  // Handle analysis using server action
  const handleAnalysis = useCallback(async (dataId: number) => {
    if (!file) {
      setAnalysisError('Please upload a file first'); // Use string error
      toast({
        title: "Analysis failed",
        description: "Please upload a file first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true); // Indicate analysis process (including polling) has started
    setAnalysisError(null);
    setAnalysisProgress(10); // Start progress at 10%

    try {
      console.log('Starting analysis with server action...');
      const result = await analyzeAction(dataId, isTextFile);

      if (result.success && result.analysisResponse) {
        const analysisId = result.analysisResponse.result_id.toString();
        setAnalysisResultId(analysisId);
        startPolling(analysisId); // Start polling via the hook
        setAnalysisProgress(30);
        toast({
          title: "Analysis started",
          description: "Analysis started successfully. This may take a few moments...",
          variant: "default",
        });
      } else {
        // Handle error from server action (Type Guard)
        if (!result.success) {
            const errorMessage = result.error || 'Analysis failed';
            setAnalysisError(errorMessage); // Store error message string
            toast({ title: "Analysis failed", description: errorMessage, variant: "destructive" });
        } else {
             setAnalysisError('Analysis initiation failed unexpectedly.');
             toast({ title: "Analysis failed", description: 'Analysis initiation failed unexpectedly.', variant: "destructive" });
        }
        setIsAnalyzing(false); // Analysis failed, stop indicating analysis is running
      }
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown analysis error';
      setAnalysisError(errorMsg); // Store error message string
      toast({ title: "Analysis failed", description: errorMsg, variant: "destructive" });
      setIsAnalyzing(false); // Analysis failed, stop indicating analysis is running
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, isTextFile, toast, startPolling]); // Depends on startPolling from the hook

  // Handle file upload using server action
  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Please select a file to upload'); // Use string error
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
      const authToken = await apiClient.getAuthToken();
      if (authToken) {
        setCookie('auth-token', authToken);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('isTextFile', String(isTextFile));

      const result = await uploadAction(formData);

      if (result.success && result.uploadResponse) {
        setUploadProgress(100);
        setUploadResponse(result.uploadResponse);
        toast({
          title: "Upload successful",
          description: `File ${fileName} uploaded successfully.`,
          variant: "default",
        });
        // Start analysis immediately after successful upload
        await handleAnalysis(result.uploadResponse.data_id);
      } else {
         // Handle error from server action (Type Guard)
        if (!result.success) {
            const errorMessage = result.error || 'Upload failed';
            setUploadError(errorMessage); // Use string error
            toast({ title: "Upload failed", description: errorMessage, variant: "destructive" });
        } else {
             setUploadError('Upload failed unexpectedly.');
             toast({ title: "Upload failed", description: 'Upload failed unexpectedly.', variant: "destructive" });
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown upload error';
      setUploadError(errorMsg); // Use string error
      toast({ title: "Upload failed", description: errorMsg, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [file, isTextFile, toast, fileName, handleAnalysis]); // handleAnalysis is now defined before this

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFile(file);
      setFileName(file.name);
      setFileSize(file.size);
      setIsTextFile(file.type.includes('text') || file.name.endsWith('.txt'));

      // Reset states
      setUploadProgress(0);
      setAnalysisResultId(null);
      setUploadError(null);
      setAnalysisError(null);
      setIsAnalyzing(false);
      setAnalysisStatus(null);
      stopPolling(); // Stop polling if a new file is selected
    }
  }, [stopPolling]); // Depends on stopPolling from the hook

  // Handle clear file
  const handleClearFile = useCallback(() => {
    setFile(null);
    setFileName('');
    setFileSize(0);
    setUploadProgress(0);
    setAnalysisResultId(null);
    setUploadError(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
    setAnalysisStatus(null);
    stopPolling(); // Stop polling on clear

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [stopPolling]); // Depends on stopPolling from the hook

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

  // Trigger file input click
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);


  // Effect for visual progress increment during polling (optional)
  useEffect(() => {
    let progressIncrementInterval: NodeJS.Timeout | null = null;
    if (isPolling && analysisStatus !== 'completed' && analysisStatus !== 'failed') {
      progressIncrementInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 5, 95));
      }, 3000);
    } else {
      if (progressIncrementInterval) clearInterval(progressIncrementInterval);
    }
    return () => {
      if (progressIncrementInterval) clearInterval(progressIncrementInterval);
    };
  }, [isPolling, analysisStatus]);

  // --- Render Logic ---
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
              data-testid="file-input"
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
                {uploadError /* Display string directly */}
              </AlertDescription>
            </Alert>
          )}

          {/* Analysis error message */}
          {analysisError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {analysisError /* Display string directly */}
              </AlertDescription>
            </Alert>
          )}

          {/* Upload progress */}
          {isUploading && !uploadResponse && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Uploading...</span>
                <span>Please wait</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {/* Analysis progress */}
          {isAnalyzing && ( // Show analysis progress if analysis initiation or polling is active
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
          {/* Conditionally render Upload or Analyze button */}
          {!uploadResponse ? (
             <Button
               variant="secondary"
               onClick={handleUpload}
               disabled={isUploading || isAnalyzing || !fileName}
             >
               {isUploading ? 'Uploading...' : 'Upload & Analyze'}
             </Button>
          ) : (
             <Button
               onClick={() => handleAnalysis(uploadResponse.data_id)}
               disabled={isUploading || isAnalyzing} // Disable if upload/analysis is running
             >
               {isAnalyzing ? 'Analyzing...' : 'Re-Analyze'}
             </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
