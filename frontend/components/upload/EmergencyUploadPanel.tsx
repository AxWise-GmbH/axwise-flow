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
import type { UploadResponse } from '@/types/api';
import { uploadAction, analyzeAction } from '@/app/actions';
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
  const [analysisStage, setAnalysisStage] = useState<string | null>(null); // Added stage state

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
  // Create a bound version of the checkAnalysisStatus method to ensure 'this' context is preserved
  const boundCheckAnalysisStatus = useCallback(
    (resultId: string) => {
      console.log(`[boundCheckAnalysisStatus] Checking status for ID: ${resultId}`);
      return apiClient.checkAnalysisStatus(resultId);
    },
    []
  );

  // Store the current polling ID in a ref to ensure it's always up-to-date
  const currentPollingIdRef = useRef<string | null>(null);

  const { startPolling, stopPolling, isPolling } = usePolling< {
    status: 'pending' | 'completed' | 'failed';
    progress?: number;
    currentStage?: string;
    stageStates?: Record<string, any>;
    startedAt?: string;
    completedAt?: string;
    requestId?: string;
    analysis?: any;
    error?: string;
    errorCode?: string;
    errorStage?: string;
  }>({
    fetchFn: boundCheckAnalysisStatus,
    interval: 3000, // Poll every 3 seconds
    stopCondition: (statusResult) =>
      statusResult.status === 'completed' || statusResult.status === 'failed',
    useExponentialBackoff: true, // Enable exponential backoff for retries
    maxBackoffInterval: 30000, // Max 30 seconds between retries
    maxDurationMs: 10 * 60 * 1000, // 10 minutes max polling time
    stuckDetectionCount: 5, // Consider progress stuck after 5 identical responses
    onSuccess: (statusResult) => {
      // --- START ENHANCED LOGGING ---
      console.log(`[Polling Success] Received status update for ID ${analysisResultId}:`, statusResult);
      setAnalysisStatus(statusResult.status); // Update status state

      // Update progress if available, but only if it's increasing
      if (statusResult.progress !== undefined) {
        // Convert from 0-1 scale to 0-100 scale
        const progressPercent = Math.round(statusResult.progress * 100);

        // Only update progress if it's higher than the current progress
        // This prevents the progress bar from jumping back and forth
        setAnalysisProgress(prevProgress => {
          if (progressPercent > prevProgress) {
            console.log(`[Polling Success] Updated progress from ${prevProgress}% to ${progressPercent}%`);
            return progressPercent;
          }
          return prevProgress;
        });
      }

      if (statusResult.status === 'completed') {
        // Get the current polling ID from the ref or from the state
        const currentId = currentPollingIdRef.current || analysisResultId;
        console.log(`[Polling Success] Status is 'completed'. Preparing to redirect for ID: ${currentId}`);
        setIsAnalyzing(false);
        setAnalysisProgress(100);
        toast({
          title: "Analysis completed",
          description: "Redirecting to visualization...",
          variant: "default",
        });

        // Log before calling server action
        console.log(`[Redirect] Calling getRedirectUrl for ID: ${currentId}`);
        if (!currentId) {
          console.error("[Redirect] Error: No valid analysis ID available for redirection!");
          setAnalysisError("Internal error: Missing analysis ID for redirection.");
          return; // Prevent further execution
        }

        // Use setTimeout for redirection
        setTimeout(() => {
          console.log(`[Redirect] Starting redirect process for ID: ${currentId}`);

          // Store the analysis ID in localStorage for fallback retrieval
          if (typeof window !== 'undefined') {
            localStorage.setItem('recentAnalysisId', currentId);
            console.log(`[Redirect] Stored analysis ID in localStorage: ${currentId}`);
          }

          // Redirect directly to the main dashboard with the analysis ID
          // This will show the analysis results in the main dashboard
          const timestamp = Date.now();
          const dashboardUrl = `/unified-dashboard?analysisId=${currentId}&visualizationTab=themes&timestamp=${timestamp}`;
          console.log(`[Redirect] Redirecting to dashboard: ${dashboardUrl}`);
          router.push(dashboardUrl);
        }, 800); // Keep delay

      } else if (statusResult.status === 'failed') {
        console.log(`[Polling Success] Status is 'failed'. Error: ${statusResult.error}, Code: ${statusResult.errorCode}`);
        setIsAnalyzing(false); // Analysis/Polling is finished
        setAnalysisProgress(0);

        // Format a more user-friendly error message
        let errorMsg = statusResult.error || 'Analysis failed during processing';
        if (statusResult.errorStage) {
          errorMsg = `Analysis failed during ${statusResult.errorStage.toLowerCase().replace('_', ' ')}: ${errorMsg}`;
        }

        setAnalysisError(errorMsg);
        toast({
          title: "Analysis failed",
          description: errorMsg,
          variant: "destructive",
        });
      } else if (statusResult.status === 'pending') {
        // Update UI with current stage information
        console.log(`[Polling Success] Status is 'pending'. Current stage: ${statusResult.currentStage}, Progress: ${statusResult.progress}`);

        // Only update the stage message if we have a valid stage and it's different from the current one
        if (statusResult.currentStage) {
          // Format a user-friendly stage message
          const stageName = statusResult.currentStage.replace(/_/g, ' ').toLowerCase();
          const stageMessage = `Processing: ${stageName}`;

          // Update the UI with the current stage information only if it's different
          // This prevents the UI from "jumping" between the same stage
          setAnalysisStage(prevStage => {
            // If the stage is the same, don't update to avoid re-renders
            if (prevStage === stageMessage) {
              return prevStage;
            }
            return stageMessage;
          });
        } else {
          // If no stage is provided, use progress-based messaging
          const progressBasedStage =
            statusResult.progress && statusResult.progress < 0.3 ? 'Starting analysis...' :
            statusResult.progress && statusResult.progress < 0.6 ? 'Processing interview data...' :
            statusResult.progress && statusResult.progress < 0.9 ? 'Generating insights...' :
            'Finalizing results...';

          setAnalysisStage(progressBasedStage);
        }
      } else {
        console.log(`[Polling Success] Status is '${statusResult.status}'. Continuing poll.`);
      }
      // --- END ENHANCED LOGGING ---
    },
    onError: (error) => {
      console.error('[Polling Error] Error polling for analysis status:', error);

      // Check if this is a timeout error from our enhanced polling
      if (error.message && error.message.includes('Polling timed out after')) {
        console.warn('[Polling Error] Polling timed out. Analysis may still be running in the background.');
        setIsAnalyzing(false);
        setAnalysisError(`Analysis is taking longer than expected. It may still be processing in the background.
          You can check the results page later or try refreshing the page.`);
        toast({
          title: "Analysis timeout",
          description: "Analysis is taking longer than expected. It may still be processing in the background.",
          variant: "destructive",
        });

        // Redirect to results page anyway, as the analysis might be complete
        if (analysisResultId) {
          router.push(`/unified-dashboard/visualize?analysisId=${analysisResultId}`);
        }
        return;
      }

      // Don't stop polling on the first error - allow retries
      // Just log the error and continue polling
      const errorMsg = error instanceof Error ? error.message : 'Polling fetch failed';
      console.warn(`[Polling Warning] ${errorMsg} - will retry`);

      // Only show a toast and update UI after multiple consecutive errors
      // This prevents UI flickering for transient network issues
      // For now, we'll continue polling without showing errors to the user

      // If you want to stop polling after errors, uncomment these:
      // setAnalysisError(errorMsg);
      // toast({ title: "Polling Error", description: errorMsg, variant: "destructive" });
      // stopPolling();
      // setIsAnalyzing(false);
    },
  });

  // Effect to stop polling when component unmounts
  useEffect(() => {
    return () => {
      console.log('[EmergencyUploadPanel] Component unmounting, stopping polling');
      stopPolling();
    };
  }, [stopPolling]);

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
        console.log(`[Analysis] Successfully started analysis with ID: ${analysisId}`);

        // Store the analysis ID in state and ref to ensure it's available for redirection
        setAnalysisResultId(analysisId);
        currentPollingIdRef.current = analysisId;

        // Start polling with a small delay to ensure the backend has time to initialize the analysis
        setTimeout(() => {
          console.log(`[Analysis] Starting polling for ID: ${analysisId}`);
          startPolling(analysisId); // Start polling via the hook
        }, 500);

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
      setAnalysisStage(null);
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
    setAnalysisStage(null);
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

    // Only increment progress if we're actively polling and not completed/failed
    if (isPolling && analysisStatus !== 'completed' && analysisStatus !== 'failed') {
      // Use a longer interval to avoid too frequent updates
      // This helps prevent the progress bar from jumping around too much
      progressIncrementInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          // Only increment if we haven't received a real progress update recently
          // This is indicated by the progress being at certain thresholds

          // If progress is at exactly 10, 30, 60, or 90, it's likely from our initial setting
          // or from a backend update, so we should increment it
          const isAtThreshold = prev === 10 || prev === 30 || prev === 60 || prev === 90;

          // If we're at a threshold or progress is low, increment it
          if (isAtThreshold || prev < 20) {
            // Smaller increments as we get closer to 95%
            const increment = prev < 50 ? 2 : prev < 80 ? 1 : 0.5;
            return Math.min(prev + increment, 95);
          }

          // Otherwise, keep the current progress
          return prev;
        });
      }, 3000); // Less frequent updates to avoid conflicts with real progress updates
    } else if (analysisStatus === 'completed') {
      // Ensure we reach 100% on completion
      setAnalysisProgress(100);
    } else if (analysisStatus === 'failed') {
      // Reset progress on failure
      setAnalysisProgress(0);
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
                <span>
                  {analysisStatus === 'completed' ? 'Analysis complete!' :
                   analysisStatus === 'failed' ? 'Analysis failed' :
                   analysisStage ? analysisStage :
                   analysisProgress < 30 ? 'Starting analysis...' :
                   analysisProgress < 60 ? 'Processing interview data...' :
                   analysisProgress < 90 ? 'Generating insights...' :
                   'Finalizing results...'}
                </span>
                <span>
                  {analysisStatus === 'completed' ? 'Redirecting...' :
                   analysisStatus === 'failed' ? 'See error below' :
                   'Please wait'}
                </span>
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
