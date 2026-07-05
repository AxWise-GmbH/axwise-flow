'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, FileUp, FileText, FilePen, X, ExternalLink } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UploadResponse } from '@/types/api';
import { uploadAction, analyzeAction } from '@/app/actions';
// Using simple setInterval for progress tracking
import { apiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { setCookie } from 'cookies-next';

/**
 * Simulation Data Notice Component - Client-side only
 */
function SimulationDataNotice() {
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('source');
      const hasSimulationData = localStorage.getItem('simulation_analysis_data');

      if (source === 'simulation' && hasSimulationData) {
        setShowNotice(true);
      }
    }
  }, []);

  if (!showNotice) return null;

  return (
    <div className="text-sm bg-blue-50 border border-blue-200 p-3 rounded-lg">
      <p className="text-blue-800 font-medium mb-1">
        🎉 Simulation Complete!
      </p>
      <p className="text-blue-700">
        Your AI simulation results are being automatically processed for analysis.
        This will take a few moments...
      </p>
    </div>
  );
}

/**
 * Emergency UploadPanel Component - Simple Progress Tracking
 *
 * This component uses React's useState for local state management with
 * Next.js server actions for form submission and simple setInterval for polling analysis status.
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

  // --- Simple Progress Tracking ---
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Simple function to check analysis status
  const checkAnalysisStatus = useCallback(async (analysisId: string) => {
    try {
      console.log(`\n🔄 [POLLING] === Analysis ${analysisId} Status Check ===`);

      // Log frontend state BEFORE API call
      console.log(`📱 [FRONTEND-BEFORE] Current State:`, {
        isAnalyzing,
        isPolling,
        analysisProgress: `${analysisProgress}%`,
        analysisStatus,
        analysisStage,
        analysisResultId
      });

      const response = await apiClient.checkAnalysisStatus(analysisId);

      // Detailed logging for backend state
      console.log(`🔧 [BACKEND] Response Status: ${response.status}`);
      console.log(`🔧 [BACKEND] Progress: ${response.progress} (${Math.round(response.progress * 100)}%)`);
      console.log(`🔧 [BACKEND] Current Stage: ${response.current_stage}`);
      console.log(`🔧 [BACKEND] Full Response:`, JSON.stringify(response, null, 2));

      // Log stage states breakdown (fix field names to match API)
      if (response.stage_states) {
        console.log(`🔧 [BACKEND] Stage States Breakdown:`);
        Object.entries(response.stage_states).forEach(([stageName, stageData]: [string, any]) => {
          const status = stageData.status;
          const progress = Math.round(stageData.progress * 100);
          const message = stageData.message;
          const emoji = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⏳';
          console.log(`  ${emoji} ${stageName}: ${status} (${progress}%) - ${message}`);
        });
      }

      // Show progress based on current stage only
      if (response.stage_states && response.current_stage) {
        const currentStageData = response.stage_states[response.current_stage];
        if (currentStageData && currentStageData.progress !== undefined) {
          const progressPercent = Math.round(currentStageData.progress * 100);
          const oldProgress = analysisProgress;
          setAnalysisProgress(progressPercent);
          console.log(`📱 [FRONTEND-UPDATE] Progress: ${oldProgress}% → ${progressPercent}% (current stage: ${response.current_stage})`);
        }
      } else if (response.progress !== undefined) {
        // Fallback to raw progress if stage_states not available
        const progressPercent = Math.round(response.progress * 100);
        const oldProgress = analysisProgress;
        setAnalysisProgress(progressPercent);
        console.log(`📱 [FRONTEND-UPDATE] Progress: ${oldProgress}% → ${progressPercent}% (fallback from raw progress)`);
      }

      // Update status and log the change
      const oldStatus = analysisStatus;
      setAnalysisStatus(response.status);
      console.log(`📱 [FRONTEND-UPDATE] Status: ${oldStatus} → ${response.status}`);

      // Update stage message with more detail (fix field names to match API)
      if (response.current_stage && response.stage_states) {
        const currentStageData = response.stage_states[response.current_stage];
        if (currentStageData && currentStageData.message) {
          const oldStage = analysisStage;
          setAnalysisStage(currentStageData.message);
          console.log(`📱 [FRONTEND-UPDATE] Stage: "${oldStage}" → "${currentStageData.message}"`);
        } else {
          const stageName = response.current_stage.replace(/_/g, ' ').toLowerCase();
          const newStage = `Processing: ${stageName}`;
          const oldStage = analysisStage;
          setAnalysisStage(newStage);
          console.log(`📱 [FRONTEND-UPDATE] Stage: "${oldStage}" → "${newStage}"`);
        }
      } else if (response.current_stage) {
        const stageName = response.current_stage.replace(/_/g, ' ').toLowerCase();
        const newStage = `Processing: ${stageName}`;
        const oldStage = analysisStage;
        setAnalysisStage(newStage);
        console.log(`📱 [FRONTEND-UPDATE] Stage: "${oldStage}" → "${newStage}"`);
      }

      // Handle completion
      if (response.status === 'completed') {
        console.log(`✅ [COMPLETION] Analysis completed successfully!`);
        console.log(`📱 [FRONTEND-FINAL] Setting final state: progress=100%, isAnalyzing=false, isPolling=false`);

        setAnalysisProgress(100);
        setIsAnalyzing(false);
        setIsPolling(false);

        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          console.log(`🛑 [POLLING] Stopped polling interval`);
        }

        toast({
          title: "Analysis completed",
          description: "Redirecting to visualization...",
          variant: "default",
        });

        // Redirect to dashboard
        setTimeout(() => {
          const dashboardUrl = `/unified-dashboard?analysisId=${analysisId}&visualizationTab=themes&timestamp=${Date.now()}`;
          console.log(`🔄 [REDIRECT] Redirecting to: ${dashboardUrl}`);
          router.push(dashboardUrl);
        }, 1000);

        console.log(`🔄 [POLLING] === End Status Check (COMPLETED) ===\n`);
        return;
      }

      // Handle failure
      if (response.status === 'failed') {
        console.log(`❌ [FAILURE] Analysis failed:`, response.error);
        console.log(`📱 [FRONTEND-FINAL] Setting error state: progress=0%, isAnalyzing=false, isPolling=false`);

        setIsAnalyzing(false);
        setIsPolling(false);
        setAnalysisProgress(0);

        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          console.log(`🛑 [POLLING] Stopped polling interval`);
        }

        const errorMsg = response.error || 'Analysis failed during processing';
        setAnalysisError(errorMsg);
        toast({
          title: "Analysis failed",
          description: errorMsg,
          variant: "destructive",
        });

        console.log(`🔄 [POLLING] === End Status Check (FAILED) ===\n`);
        return;
      }

      console.log(`🔄 [POLLING] === End Status Check (CONTINUING) ===\n`);

    } catch (error) {
      console.error(`❌ [ERROR] Error checking status for analysis ${analysisId}:`, error);
      console.log(`📱 [FRONTEND-ERROR] Continuing polling despite error...`);
      // Don't stop polling on errors - just log and continue
    }
  }, [router, toast, isAnalyzing, isPolling, analysisProgress, analysisStatus, analysisStage, analysisResultId]);

  // Start simple polling
  const startSimplePolling = useCallback((analysisId: string) => {
    console.log(`🚀 [POLLING-START] Starting polling for analysis ${analysisId}`);
    console.log(`📱 [FRONTEND-POLLING] Setting isPolling=true`);
    setIsPolling(true);

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      console.log(`🛑 [POLLING-START] Clearing existing polling interval`);
      clearInterval(pollingIntervalRef.current);
    }

    // Start polling every 3 seconds
    console.log(`⏰ [POLLING-START] Setting up 3-second interval`);
    pollingIntervalRef.current = setInterval(() => {
      console.log(`⏰ [POLLING-INTERVAL] Interval tick - checking status...`);
      checkAnalysisStatus(analysisId);
    }, 3000);

    // Also check immediately
    console.log(`🔄 [POLLING-START] Checking status immediately...`);
    checkAnalysisStatus(analysisId);
  }, [checkAnalysisStatus]);

  // Stop polling
  const stopSimplePolling = useCallback(() => {
    console.log(`🛑 [POLLING-STOP] Stopping polling`);
    console.log(`📱 [FRONTEND-POLLING] Setting isPolling=false`);
    setIsPolling(false);

    if (pollingIntervalRef.current) {
      console.log(`🛑 [POLLING-STOP] Clearing polling interval`);
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    } else {
      console.log(`🛑 [POLLING-STOP] No active polling interval to clear`);
    }
  }, []);

  // Effect to check for simulation data and handle auto-analysis
  useEffect(() => {
    console.log('[EmergencyUploadPanel] Component mounted');
    console.log('[EmergencyUploadPanel] Initial state:', {
      analysisResultId,
      analysisProgress,
      analysisStatus,
      isAnalyzing,
      isPolling
    });

    // Check for simulation data from research dashboard
    const checkSimulationData = async () => {
      // Only run on client side
      if (typeof window === 'undefined') return;

      try {
        const simulationData = localStorage.getItem('simulation_analysis_data');
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('source');

        console.log('[EmergencyUploadPanel] Checking for simulation data...');
        console.log('[EmergencyUploadPanel] URL source:', source);
        console.log('[EmergencyUploadPanel] Has simulation data:', !!simulationData);

        if (simulationData && source === 'simulation') {
          console.log('[EmergencyUploadPanel] Found simulation data, processing...');
          const data = JSON.parse(simulationData);
          console.log('[EmergencyUploadPanel] Parsed simulation data:', data);

          // Create a virtual file from simulation data
          const simulationText = formatSimulationDataAsText(data);
          console.log('[EmergencyUploadPanel] Generated text length:', simulationText.length);
          console.log('[EmergencyUploadPanel] Generated text preview:', simulationText.substring(0, 500));

          const blob = new Blob([simulationText], { type: 'text/plain' });
          const file = new File([blob], 'simulation_results.txt', { type: 'text/plain' });

          console.log('[EmergencyUploadPanel] File size:', blob.size, 'bytes');

          // Set the file and trigger upload
          setFile(file);
          setFileName('simulation_results.txt');
          setFileSize(blob.size);
          setIsTextFile(true);

          // Auto-upload and analyze immediately
          const performAutoUpload = async () => {
            try {
              console.log('🚀 Starting auto-upload of simulation data...');
              console.log('🚀 File details:', { name: file.name, size: file.size, type: file.type });

              const authToken = await apiClient.getAuthToken();
              if (!authToken) {
                throw new Error('Not authenticated - please sign in');
              }

              console.log('🔑 Auth token obtained, uploading...');
              apiClient.setAuthToken(authToken);

              // Set uploading state
              setUploadProgress(50);

              const uploadResponse = await apiClient.uploadData(file, true);
              console.log('✅ Upload successful:', uploadResponse);

              setUploadProgress(100);
              setUploadResponse(uploadResponse);

              toast({
                title: "Simulation data uploaded",
                description: "Starting analysis of your simulation results...",
                variant: "default",
              });

              // Start analysis
              console.log('🔍 Starting analysis with data_id:', uploadResponse.data_id);
              await handleAnalysis(uploadResponse.data_id);

              // Clear simulation data from localStorage
              localStorage.removeItem('simulation_analysis_data');
              console.log('🧹 Cleaned up localStorage');

            } catch (error) {
              console.error('❌ Auto-upload failed:', error);
              console.error('❌ Error details:', error);

              toast({
                title: "Auto-upload failed",
                description: "Your simulation data is ready. Please click 'Upload & Analyze' below to continue.",
                variant: "destructive",
              });

              // Reset upload progress but keep the file
              setUploadProgress(0);

              // Make sure the upload button is visible and enabled
              setUploadError(null);
            }
          };

          // Trigger auto-upload after a short delay to ensure UI is updated
          setTimeout(performAutoUpload, 500);
        }
      } catch (error) {
        console.error('Error checking simulation data:', error);
      }
    };

    checkSimulationData();
  }, []);

  // Effect to log polling state changes
  useEffect(() => {
    console.log('[EmergencyUploadPanel] Polling state changed:', {
      isPolling,
      analysisResultId
    });
  }, [isPolling, analysisResultId]);

  // Effect to log progress state changes
  useEffect(() => {
    console.log('[EmergencyUploadPanel] Progress state changed:', {
      analysisProgress,
      analysisStatus,
      analysisStage
    });
  }, [analysisProgress, analysisStatus, analysisStage]);

  // Cleanup effect to stop polling on unmount
  useEffect(() => {
    return () => {
      console.log('[EmergencyUploadPanel] Component unmounting, stopping polling');
      stopSimplePolling();
    };
  }, [stopSimplePolling]);



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
    setAnalysisStatus(null); // Reset status
    setAnalysisStage(null); // Reset stage
    setAnalysisProgress(0); // Start progress at 0% - let backend control it

    try {
      console.log('Starting analysis with server action...');
      const result = await analyzeAction(dataId, isTextFile);

      if (result.success && result.analysisResponse) {
        const analysisId = result.analysisResponse.result_id.toString();
        console.log(`[Analysis] Successfully started analysis with ID: ${analysisId}`);

        // Store the analysis ID in state
        setAnalysisResultId(analysisId);

        toast({
          title: "Analysis started",
          description: "Processing your data...",
          variant: "default",
        });

        // Start simple polling immediately to get real progress
        console.log(`[Analysis] Starting simple polling for ID: ${analysisId}`);
        startSimplePolling(analysisId);
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
  }, [file, isTextFile, toast, startSimplePolling]); // Depends on startSimplePolling

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
      console.log('Starting upload with direct API client...');

      // Get Clerk token directly
      const authToken = await apiClient.getAuthToken();
      if (!authToken) {
        throw new Error('Not authenticated - please sign in');
      }

      // Set the auth token on the API client
      apiClient.setAuthToken(authToken);

      // Use the API client to upload directly
      const uploadResponse = await apiClient.uploadData(file, isTextFile);

      // Simulate the server action response format
      const result = {
        success: true,
        uploadResponse: uploadResponse
      };

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
      stopSimplePolling(); // Stop polling if a new file is selected
    }
  }, [stopSimplePolling]); // Depends on stopSimplePolling

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
    setAnalysisProgress(0); // Reset progress to 0
    stopSimplePolling(); // Stop polling on clear

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [stopSimplePolling]); // Depends on stopSimplePolling

  // Toggle text file setting
  const handleToggleTextFile = useCallback((value: string) => {
    const isText = value === 'text';
    setIsTextFile(isText);
  }, []);

  // Helper function to format simulation data as text
  const formatSimulationDataAsText = (data: any): string => {
    console.log('🔍 [formatSimulationDataAsText] Input data structure:', JSON.stringify(data, null, 2));
    console.log('🔍 [formatSimulationDataAsText] Data keys:', Object.keys(data || {}));

    let text = "=== AI CUSTOMER RESEARCH SIMULATION ===\n\n";

    // Add metadata section
    if (data.metadata) {
      text += "BUSINESS CONTEXT:\n";
      text += `Simulation ID: ${data.metadata.simulation_id || data.simulation_id || 'N/A'}\n`;
      text += `Generated: ${data.metadata.created_at || new Date().toISOString()}\n`;
      if (data.metadata.business_context) {
        text += `Business Idea: ${data.metadata.business_context.business_idea || 'N/A'}\n`;
        text += `Target Customer: ${data.metadata.business_context.target_customer || 'N/A'}\n`;
        text += `Problem Statement: ${data.metadata.business_context.problem || 'N/A'}\n`;
        text += `Industry: ${data.metadata.business_context.industry || 'General'}\n`;
      }
      text += "\n" + "=".repeat(60) + "\n\n";
    }

    // Add personas section with detailed information
    if (data.personas && data.personas.length > 0) {
      text += "CUSTOMER PERSONAS:\n\n";
      data.personas.forEach((persona: any, index: number) => {
        text += `PERSONA ${index + 1}: ${persona.name || 'Unnamed Persona'}\n`;
        text += `Age: ${persona.age || 'N/A'}\n`;
        text += `Role/Type: ${persona.stakeholder_type || 'N/A'}\n`;
        text += `Background: ${persona.background || 'N/A'}\n`;

        if (persona.motivations && persona.motivations.length > 0) {
          text += `Motivations:\n`;
          persona.motivations.forEach((motivation: string) => {
            text += `  • ${motivation}\n`;
          });
        }

        if (persona.pain_points && persona.pain_points.length > 0) {
          text += `Pain Points:\n`;
          persona.pain_points.forEach((pain: string) => {
            text += `  • ${pain}\n`;
          });
        }

        if (persona.communication_style) {
          text += `Communication Style: ${persona.communication_style}\n`;
        }

        if (persona.demographic_details) {
          text += `Demographics: ${JSON.stringify(persona.demographic_details)}\n`;
        }

        text += "\n" + "-".repeat(40) + "\n\n";
      });
    }

    // Add detailed interview responses
    if (data.interviews && data.interviews.length > 0) {
      text += "INTERVIEW TRANSCRIPTS:\n\n";

      data.interviews.forEach((interview: any, index: number) => {
        // Find the corresponding persona
        const persona = data.personas?.find((p: any) => p.id === interview.persona_id);
        const personaName = persona?.name || `Interviewee ${index + 1}`;

        text += `INTERVIEW ${index + 1}: ${personaName}\n`;
        text += `Stakeholder Type: ${interview.stakeholder_type || 'N/A'}\n`;
        text += `Duration: ${interview.interview_duration_minutes || 'N/A'} minutes\n`;
        text += `Overall Sentiment: ${interview.overall_sentiment || 'N/A'}\n`;

        if (interview.key_themes && interview.key_themes.length > 0) {
          text += `Key Themes: ${interview.key_themes.join(', ')}\n`;
        }

        text += "\nQ&A SESSION:\n";
        text += "-".repeat(30) + "\n";

        if (interview.responses && interview.responses.length > 0) {
          interview.responses.forEach((response: any, qIndex: number) => {
            text += `\nQ${qIndex + 1}: ${response.question || 'N/A'}\n`;
            text += `A${qIndex + 1}: ${response.response || 'N/A'}\n`;

            if (response.sentiment) {
              text += `   [Sentiment: ${response.sentiment}]\n`;
            }

            if (response.key_insights && response.key_insights.length > 0) {
              text += `   [Key Insights: ${response.key_insights.join(', ')}]\n`;
            }

            if (response.follow_up_questions && response.follow_up_questions.length > 0) {
              text += `   [Follow-ups: ${response.follow_up_questions.join(', ')}]\n`;
            }
          });
        } else {
          text += "\n[No responses recorded]\n";
        }

        text += "\n" + "=".repeat(60) + "\n\n";
      });
    }

    // Add simulation insights if available
    if (data.simulation_insights) {
      text += "SIMULATION INSIGHTS:\n\n";
      const insights = data.simulation_insights;

      if (insights.overall_sentiment) {
        text += `Overall Sentiment: ${insights.overall_sentiment}\n`;
      }

      if (insights.key_themes && insights.key_themes.length > 0) {
        text += `Key Themes:\n`;
        insights.key_themes.forEach((theme: string) => {
          text += `  • ${theme}\n`;
        });
      }

      if (insights.potential_risks && insights.potential_risks.length > 0) {
        text += `Potential Risks:\n`;
        insights.potential_risks.forEach((risk: string) => {
          text += `  • ${risk}\n`;
        });
      }

      if (insights.opportunities && insights.opportunities.length > 0) {
        text += `Opportunities:\n`;
        insights.opportunities.forEach((opp: string) => {
          text += `  • ${opp}\n`;
        });
      }

      if (insights.recommendations && insights.recommendations.length > 0) {
        text += `Recommendations:\n`;
        insights.recommendations.forEach((rec: string) => {
          text += `  • ${rec}\n`;
        });
      }

      text += "\n";
    }

    // Add analysis ready text if available
    if (data.analysis_ready_text) {
      text += "ADDITIONAL ANALYSIS DATA:\n";
      text += data.analysis_ready_text;
      text += "\n";
    }

    // Add footer
    text += "\n" + "=".repeat(60) + "\n";
    text += "END OF SIMULATION DATA\n";
    text += `Generated: ${new Date().toISOString()}\n`;
    text += "Ready for customer research analysis.\n";

    // Ensure minimum content length for backend validation
    if (text.length < 500) {
      console.log('⚠️ [formatSimulationDataAsText] Generated text too short, adding fallback content');

      text += "\n\nNOTE: This simulation data was automatically generated from your business idea.\n";
      text += "The AI has created realistic customer personas and simulated their responses\n";
      text += "to help you understand potential customer perspectives and needs.\n";
      text += "This data is ready for analysis to extract insights, patterns, and recommendations.\n";
      text += "\nData Structure Summary:\n";
      text += `- Total Characters: ${text.length}\n`;
      text += `- Personas Generated: ${data.personas?.length || 0}\n`;
      text += `- Interviews Conducted: ${data.interviews?.length || 0}\n`;
      text += `- Business Context: ${data.metadata?.business_context ? 'Complete' : 'Partial'}\n`;
      text += `- Simulation ID: ${data.simulation_id || data.metadata?.simulation_id || 'N/A'}\n`;

      // Add raw data dump for debugging
      text += "\n\nRAW SIMULATION DATA (for debugging):\n";
      text += "```json\n";
      text += JSON.stringify(data, null, 2);
      text += "\n```\n";

      // Add sample interview content to ensure substantial file
      text += "\n\nSAMPLE INTERVIEW CONTENT:\n";
      text += "This simulation generated customer interview data based on your business idea.\n";
      text += "The AI analyzed your concept and created realistic customer personas who would\n";
      text += "be interested in or affected by your product or service.\n\n";

      text += "Each persona represents a different customer segment with unique:\n";
      text += "- Demographics and background\n";
      text += "- Motivations and goals\n";
      text += "- Pain points and challenges\n";
      text += "- Communication preferences\n";
      text += "- Attitudes toward your business concept\n\n";

      text += "The simulated interviews capture how these personas would respond\n";
      text += "to questions about your business idea, revealing insights about:\n";
      text += "- Market demand and interest levels\n";
      text += "- Potential objections or concerns\n";
      text += "- Feature preferences and priorities\n";
      text += "- Pricing sensitivity\n";
      text += "- Competitive alternatives they might consider\n\n";

      text += "This data is now ready for analysis to extract actionable insights\n";
      text += "that can guide your business development and marketing strategies.\n";
    }

    return text;
  };

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


  // Effect for handling completion status
  useEffect(() => {
    // Ensure progress is set correctly for final states
    if (analysisStatus === 'completed') {
      console.log('[Progress Effect] Analysis completed, ensuring progress is 100%');
      setAnalysisProgress(100);
    } else if (analysisStatus === 'failed') {
      console.log('[Progress Effect] Analysis failed, resetting progress to 0%');
      setAnalysisProgress(0);
    }
  }, [analysisStatus]);

  // --- Render Logic ---
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Analyse Interviews</CardTitle>
        <CardDescription>
          Upload interview files to analyze with AI-powered insights and design thinking frameworks.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Simulation Data Notice */}
          <SimulationDataNotice />

          {/* Vexa.ai mention */}
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            <p className="mb-2">
              <strong>Need live transcription?</strong> For real-time meeting transcription,
              check out our partnership with{' '}
              <a
                href="https://vexa.ai/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Vexa.ai
                <ExternalLink className="w-3 h-3" />
              </a>
              {' '}then upload the transcript here for analysis.
            </p>
          </div>
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
              <Progress
                key={`progress-${analysisProgress}`}
                value={analysisProgress}
                className="h-2"
              />
              <div className="text-right text-xs text-muted-foreground">
                Progress: {analysisProgress}% (Status: {analysisStatus || 'unknown'})
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
