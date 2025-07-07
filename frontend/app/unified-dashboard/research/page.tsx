'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Upload, FileText, Users, Clock, Eye, Play, Loader2, Download, MessageSquare } from 'lucide-react';
import { createSimulation } from '@/lib/api/simulation';

interface QuestionnaireSession {
  session_id: string;
  title: string;
  question_count?: number;
  stakeholder_count?: number;
  questionnaire_generated_at?: string;
  questionnaire_exported?: boolean;
}

interface SimulationResult {
  simulation_id: string;
  created_at?: string;
}

export default function InterviewSimulationPage() {
  const router = useRouter();
  const [questionnaireSessions, setQuestionnaireSessions] = useState<QuestionnaireSession[]>([]);
  const [completedSimulations, setCompletedSimulations] = useState<SimulationResult[]>([]);
  const [isLoadingQuestionnaires, setIsLoadingQuestionnaires] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSimulationResult, setLastSimulationResult] = useState<any>(null);
  const [simulationProgress, setSimulationProgress] = useState<any>(null);
  const [completedInterviews, setCompletedInterviews] = useState<any[]>([]);
  const [currentSimulationId, setCurrentSimulationId] = useState<string | null>(null);

  useEffect(() => {
    console.log('🚀 InterviewSimulationPage component mounted, loading data...');
    loadQuestionnaires();
    loadCompletedSimulations();
  }, []);

  const loadQuestionnaires = async () => {
    try {
      console.log('🔍 Loading questionnaires from backend and localStorage...');
      setIsLoadingQuestionnaires(true);

      let allSessions: any[] = [];

      // Try to load from backend first
      try {
        const response = await fetch('/api/research/sessions');
        console.log('📊 Backend response status:', response.status);

        if (response.ok) {
          const backendSessions = await response.json();
          console.log('💾 Backend sessions:', backendSessions.length);

          const backendQuestionnaires = backendSessions.filter((session: any) =>
            session.questionnaire_generated_at && session.questionnaire_data
          );
          allSessions.push(...backendQuestionnaires);
        }
      } catch (error) {
        console.warn('⚠️ Failed to load from backend:', error);
      }

      // Load from localStorage (like questionnaire history page does)
      try {
        const localSessions = JSON.parse(localStorage.getItem('axwise_research_sessions') || '{}');
        const localSessionsArray = Object.values(localSessions);
        console.log('🔍 All local sessions found:', localSessionsArray.length);

        const localQuestionnaires = localSessionsArray.filter((session: any) => {
          // Log the complete session to see all available fields
          console.log(`🔍 Complete session ${session.session_id}:`, session);

          const hasQuestionnaire = session.questions_generated;
          console.log(`Session ${session.session_id}: questions_generated=${session.questions_generated}, hasQuestionnaire=${hasQuestionnaire}`);
          return hasQuestionnaire;
        }).map((session: any) => {
          // Calculate stakeholder and question counts from questionnaire data
          let questionCount = 0;
          let stakeholderCount = 0;

          // Find questionnaire message with comprehensive questions
          const questionnaireMessage = session.messages?.find((msg: any) =>
            msg.metadata?.comprehensiveQuestions
          );

          if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
            const questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
            const primaryStakeholders = questionnaire.primaryStakeholders || [];
            const secondaryStakeholders = questionnaire.secondaryStakeholders || [];

            stakeholderCount = primaryStakeholders.length + secondaryStakeholders.length;
            questionCount = [...primaryStakeholders, ...secondaryStakeholders].reduce((total: number, stakeholder: any) => {
              const questions = stakeholder.questions || {};
              return total +
                (questions.problemDiscovery?.length || 0) +
                (questions.solutionValidation?.length || 0) +
                (questions.followUp?.length || 0);
            }, 0);
          }

          return {
            ...session,
            // Add fields expected by the UI
            title: session.business_idea || 'Untitled Research Session',
            question_count: questionCount,
            stakeholder_count: stakeholderCount,
            questionnaire_generated_at: session.updated_at || session.created_at || new Date().toISOString(),
          };
        });

        console.log('✅ Local questionnaire sessions:', localQuestionnaires.length);
        allSessions.push(...localQuestionnaires);
      } catch (error) {
        console.warn('⚠️ Failed to load from localStorage:', error);
      }

      console.log('✅ Total questionnaire sessions found:', allSessions.length);
      setQuestionnaireSessions(allSessions);

    } catch (error) {
      console.error('❌ Error loading questionnaires:', error);
    } finally {
      setIsLoadingQuestionnaires(false);
    }
  };

  const loadCompletedSimulations = async () => {
    try {
      // For now, we'll skip loading completed simulations since the endpoint doesn't exist
      // This can be implemented later when we have a proper simulation history endpoint
      setCompletedSimulations([]);
    } catch (error) {
      console.error('Error loading completed simulations:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setSuccess(null);
    setIsProcessing(true);

    try {
      // Read file content
      const fileContent = await file.text();

      // Use the simulation bridge endpoint
      const response = await fetch('/api/research/simulation-bridge/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw_questionnaire_content: fileContent,
          config: {
            depth: "detailed",
            personas_per_stakeholder: 1,
            response_style: "realistic",
            include_insights: false,
            temperature: 0.7
          }
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('Simulation completed successfully!');
        setLastSimulationResult(result);
        loadCompletedSimulations();
      } else {
        setError(result.detail || result.error || 'Failed to process questionnaire');
      }
    } catch (error) {
      setError('Failed to upload and process questionnaire');
    } finally {
      setIsProcessing(false);
    }
  };

  // Progress polling function
  const pollSimulationProgress = async (simulationId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/research/simulation-bridge/simulate/${simulationId}/progress`);
      if (response.ok) {
        const progress = await response.json();
        setSimulationProgress(progress);

        // Check if simulation is complete
        if (progress.progress_percentage >= 100) {
          // Get final results
          const resultResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/research/simulation-bridge/completed/${simulationId}`);
          if (resultResponse.ok) {
            const result = await resultResponse.json();
            setLastSimulationResult(result);
            setSuccess('Simulation completed successfully!');
            setCompletedInterviews(result.interviews || []);
            loadCompletedSimulations();
          }
          setCurrentSimulationId(null);
          setIsProcessing(false);
          return false; // Stop polling
        }
        return true; // Continue polling
      }
    } catch (error) {
      console.error('Progress polling error:', error);
    }
    return true; // Continue polling on error
  };

  const handleStartChatSimulation = (sessionId: string) => {
    // Navigate to the simulation chat interface
    router.push(`/unified-dashboard/research/simulation?session=${sessionId}`);
  };

  const handleStartSimulationFromSession = async (sessionId: string) => {
    setError(null);
    setSuccess(null);
    setCompletedInterviews([]);
    setSimulationProgress(null);
    setIsProcessing(true);

    try {
      let questionnaireData = null;
      let businessContext = null;

      if (sessionId.startsWith('local_')) {
        // Handle local session - get data from localStorage
        console.log('🔍 Loading local session data for:', sessionId);
        const localSessions = JSON.parse(localStorage.getItem('axwise_research_sessions') || '{}');
        console.log('🔍 All localStorage sessions:', Object.keys(localSessions));
        console.log('🔍 Looking for session:', sessionId);

        // Find session by session_id since localStorage uses numeric keys
        const session = Object.values(localSessions).find((s: any) => s.session_id === sessionId) as any;

        if (!session) {
          const availableSessionIds = Object.values(localSessions).map((s: any) => s.session_id);
          console.error('❌ Session not found. Available session IDs:', availableSessionIds);
          throw new Error(`Local session ${sessionId} not found. Available: ${availableSessionIds.join(', ')}`);
        }

        console.log('✅ Found session:', session);

        // Find questionnaire message with comprehensive questions
        const questionnaireMessage = session.messages?.find((msg: any) =>
          msg.metadata?.comprehensiveQuestions
        );

        if (!questionnaireMessage?.metadata?.comprehensiveQuestions) {
          throw new Error('No questionnaire data found in local session');
        }

        const rawQuestionnaireData = questionnaireMessage.metadata.comprehensiveQuestions;
        console.log('🔍 Raw questionnaire data:', rawQuestionnaireData);
        console.log('🔍 Primary stakeholders:', rawQuestionnaireData.primaryStakeholders);
        console.log('🔍 Secondary stakeholders:', rawQuestionnaireData.secondaryStakeholders);
        console.log('🔍 Primary stakeholders count:', rawQuestionnaireData.primaryStakeholders?.length);
        console.log('🔍 Secondary stakeholders count:', rawQuestionnaireData.secondaryStakeholders?.length);

        // Transform the questionnaire data to match the backend Stakeholder model
        const transformStakeholder = (stakeholder: any, index: number) => {
          const transformed = {
            id: stakeholder.id || `stakeholder_${index}`,
            name: stakeholder.name || stakeholder.title || `Stakeholder ${index + 1}`,
            description: stakeholder.description || stakeholder.role || '',
            questions: [
              ...(stakeholder.questions?.problemDiscovery || []),
              ...(stakeholder.questions?.solutionValidation || []),
              ...(stakeholder.questions?.followUp || [])
            ]
          };
          console.log(`🔄 Transformed stakeholder ${index}:`, transformed);
          return transformed;
        };

        const primaryStakeholders = (rawQuestionnaireData.primaryStakeholders || []).map(transformStakeholder);
        const secondaryStakeholders = (rawQuestionnaireData.secondaryStakeholders || []).map(transformStakeholder);

        console.log('🔄 Transformed primary stakeholders:', primaryStakeholders);
        console.log('🔄 Transformed secondary stakeholders:', secondaryStakeholders);

        questionnaireData = {
          stakeholders: {
            primary: primaryStakeholders,
            secondary: secondaryStakeholders
          },
          timeEstimate: rawQuestionnaireData.timeEstimate || {
            totalQuestions: 0
          }
        };

        businessContext = {
          business_idea: session.business_idea || '',
          target_customer: session.target_customer || '',
          problem: session.problem || ''
        };

        console.log('✅ Transformed questionnaire data:', questionnaireData);
        console.log('✅ Business context:', businessContext);
      } else {
        // Handle backend session - fetch from API
        console.log('🔍 Loading backend session data for:', sessionId);
        const sessionResponse = await fetch(`/api/research/sessions/${sessionId}/questionnaire`);
        if (!sessionResponse.ok) {
          throw new Error('Failed to load questionnaire from backend session');
        }

        const sessionData = await sessionResponse.json();
        questionnaireData = sessionData.questionnaire_data;
        businessContext = sessionData.business_context;
      }

      // Use the existing simulation API client
      console.log('🚀 Starting simulation with data:', {
        questions_data: questionnaireData,
        business_context: businessContext
      });

      const config = {
        depth: "detailed" as const,
        personas_per_stakeholder: 5, // 5 interviews per stakeholder
        response_style: "realistic" as const,
        include_insights: false,
        temperature: 0.7
      };

      const result = await createSimulation(questionnaireData, businessContext, config);
      console.log('✅ Simulation result:', result);
      console.log('✅ Simulation result type:', typeof result);
      console.log('✅ Simulation result keys:', Object.keys(result || {}));
      console.log('✅ Has simulation_id?', !!result.simulation_id);
      console.log('✅ Has interviews?', !!result.interviews);
      console.log('✅ Has data?', !!result.data);

      // Check if we got a simulation_id for progress tracking
      if (result.simulation_id) {
        setCurrentSimulationId(result.simulation_id);
        console.log('🔄 Starting progress polling for simulation:', result.simulation_id);

        // Start polling for progress
        const pollInterval = setInterval(async () => {
          const shouldContinue = await pollSimulationProgress(result.simulation_id!);
          if (!shouldContinue) {
            clearInterval(pollInterval);
          }
        }, 2000); // Poll every 2 seconds

        // Set timeout to stop polling after 10 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          if (currentSimulationId) {
            setError('Simulation timeout - please check simulation history');
            setIsProcessing(false);
          }
        }, 600000);
      } else {
        // Immediate result (old behavior) - but still show progress UI
        console.log('📊 No simulation_id, showing immediate results with progress simulation');

        // Simulate progress for better UX
        setSimulationProgress({
          progress_percentage: 100,
          current_task: 'Simulation completed',
          completed_interviews: result.interviews?.length || result.data?.interviews?.length || 0,
          total_interviews: result.interviews?.length || result.data?.interviews?.length || 0
        });

        setSuccess('Simulation completed successfully!');
        setLastSimulationResult(result);
        setCompletedInterviews(result.interviews || result.data?.interviews || []);
        loadCompletedSimulations();
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('❌ Simulation error:', error);

      // Better error handling for different error types
      let errorMessage = 'Failed to start simulation';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle API error objects
        errorMessage = JSON.stringify(error, null, 2);
      }

      console.error('❌ Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewQuestionnaire = (sessionId: string) => {
    router.push(`/unified-dashboard/questionnaire-history?session=${sessionId}`);
  };

  const downloadSingleInterview = (interview: any, interviewNumber: number) => {
    // Find the corresponding persona data
    const persona = lastSimulationResult?.data?.personas?.find((p: any) => p.id === interview.persona_id) ||
                   lastSimulationResult?.personas?.find((p: any) => p.id === interview.persona_id);

    const content = `INTERVIEW ${interviewNumber}
================

Persona: ${persona?.name || interview.persona_id || 'Unknown'}
Stakeholder Type: ${interview.stakeholder_type}

RESPONSES:
----------

${interview.responses?.map((response: any, i: number) => `Q${i + 1}: ${response.question}

A${i + 1}: ${response.response}
`).join('\n---\n') || 'No responses available'}

================
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Create meaningful filename with stakeholder and persona names
    const stakeholderName = (interview.stakeholder_type || 'Unknown_Stakeholder').replace(/\s+/g, '_');
    const personaName = (persona?.name || 'Unknown_Persona').replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];

    a.download = `interview_${interviewNumber}_${stakeholderName}_${personaName}_${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadInterviewsFromData = (simulationData: any) => {
    console.log('📥 Download data structure:', simulationData);

    // Handle the correct data structure from SimulationResponse
    const interviews = simulationData?.data?.interviews || simulationData?.interviews;
    if (!interviews || !Array.isArray(interviews)) {
      console.error('❌ No interviews found in simulation data');
      return;
    }

    console.log('📥 Found interviews:', interviews.length);

    const content = interviews.map((interview: any, index: number) => {
      // Find the corresponding persona data
      const persona = simulationData?.data?.personas?.find((p: any) => p.id === interview.persona_id) ||
                     simulationData?.personas?.find((p: any) => p.id === interview.persona_id);

      return `INTERVIEW ${index + 1}
================

Persona: ${persona?.name || interview.persona_id || 'Unknown'}
Stakeholder Type: ${interview.stakeholder_type}

RESPONSES:
----------

${interview.responses?.map((response: any, i: number) => `Q${i + 1}: ${response.question}

A${i + 1}: ${response.response}
`).join('\n---\n') || 'No responses available'}

================
`;
    }).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interviews_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadInterviewsDirectly = async (simulationId: string) => {
    // This functionality is not yet implemented
    console.log('Download functionality not yet implemented for simulation:', simulationId);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Interview Simulation</h1>
        <p className="text-muted-foreground">
          Upload your questionnaire file or select from generated questionnaires
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Main Generated Questionnaires Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  Simulate Interview based on Questionnaire
                </CardTitle>
                <CardDescription>
                  Upload your questionnaire in .txt or select from questionnaires created in Research Chat
                </CardDescription>
              </div>
              {/* Subtle Upload Button */}
              <div className="text-center">
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="questionnaire-upload"
                />
                <label htmlFor="questionnaire-upload">
                  <Button disabled={isProcessing} variant="outline" size="sm" className="text-muted-foreground" asChild>
                    <span>
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-3 w-3" />
                          Upload File
                        </>
                      )}
                    </span>
                  </Button>
                </label>
                {selectedFile && !isProcessing && (
                  <div className="mt-2 p-1 bg-green-50 border border-green-200 rounded text-xs text-green-600">
                    {selectedFile.name}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error and Success Messages */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Progress Display */}
            {simulationProgress && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-blue-900">Simulation in Progress</h4>
                  <span className="text-sm text-blue-600">{simulationProgress.progress_percentage}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${simulationProgress.progress_percentage}%` }}
                  ></div>
                </div>
                <p className="text-sm text-blue-700">{simulationProgress.current_task}</p>
                <div className="text-xs text-blue-600 mt-1">
                  Interviews: {simulationProgress.completed_interviews || 0} / {simulationProgress.total_interviews || 0}
                </div>
              </div>
            )}

            {/* Completed Interviews Display */}
            {completedInterviews.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-900 mb-3">Completed Interviews ({completedInterviews.length})</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {completedInterviews.map((interview, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                      <div>
                        <span className="font-medium">Interview {index + 1}</span>
                        <span className="text-sm text-gray-600 ml-2">
                          {(() => {
                            const persona = lastSimulationResult?.data?.personas?.find((p: any) => p.id === interview.persona_id) ||
                                           lastSimulationResult?.personas?.find((p: any) => p.id === interview.persona_id);
                            const personaName = persona?.name || 'Unknown Persona';
                            const stakeholderName = interview.stakeholder_type || 'Unknown Stakeholder';
                            return `${stakeholderName} - ${personaName}`;
                          })()}
                        </span>
                      </div>
                      <Button
                        onClick={() => downloadSingleInterview(interview, index + 1)}
                        variant="outline"
                        size="sm"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">{success}</p>
                {lastSimulationResult && (
                  <Button
                    onClick={() => downloadInterviewsFromData(lastSimulationResult)}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Interviews
                  </Button>
                )}
              </div>
            )}

            {/* Loading State */}
            {isLoadingQuestionnaires && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading questionnaires...</span>
              </div>
            )}

            {/* OR Divider */}
            {!isLoadingQuestionnaires && questionnaireSessions.length > 0 && (
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-border"></div>
                <span className="text-xs text-muted-foreground font-medium">OR</span>
                <div className="flex-1 h-px bg-border"></div>
              </div>
            )}

            {/* Generated Questionnaires List */}
            {!isLoadingQuestionnaires && questionnaireSessions.length > 0 && (
              <div className="space-y-3">
                {questionnaireSessions.map((session) => (
                  <div key={session.session_id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-base mb-2 truncate">{session.title}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            <span>{session.question_count || 0} questions</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{session.stakeholder_count || 0} stakeholders</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {session.questionnaire_generated_at
                                ? new Date(session.questionnaire_generated_at).toLocaleDateString('en-GB') + ' at ' + new Date(session.questionnaire_generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                : 'Recently generated'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewQuestionnaire(session.session_id)}
                          title="View questionnaire"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleStartChatSimulation(session.session_id)}
                            title="Interactive chat simulation"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Chat Simulation
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => handleStartSimulationFromSession(session.session_id)}
                            title="Batch simulation (original)"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Batch Simulation
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoadingQuestionnaires && questionnaireSessions.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No generated questionnaires</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create questionnaires in Research Chat to see them here, or upload your own file above
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/unified-dashboard/research-chat')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Start Research Chat
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Simulations */}
        {completedSimulations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Simulations</CardTitle>
              <CardDescription>Download your completed interview simulations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {completedSimulations.map((sim) => (
                  <div key={sim.simulation_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Simulation {sim.simulation_id}</div>
                      <div className="text-sm text-muted-foreground">
                        {sim.created_at ? new Date(sim.created_at).toLocaleString() : 'Recently completed'}
                      </div>
                    </div>
                    <Button
                      onClick={() => downloadInterviewsDirectly(sim.simulation_id)}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Interviews
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
