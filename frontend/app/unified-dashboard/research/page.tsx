'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Users,
  Target,
  Lightbulb,
  ArrowRight,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useResearch } from '@/hooks/use-research';
import { ResearchContextDisplay } from '@/components/research/dashboard/ResearchContextDisplay';
import { EmbeddedChatDisplay } from '@/components/research/dashboard/EmbeddedChatDisplay';
import { QuestionGenerationPanel } from '@/components/research/dashboard/QuestionGenerationPanel';
import { SimulationConfigModal } from '@/components/research/simulation/SimulationConfigModal';
import { SimulationProgress } from '@/components/research/simulation/SimulationProgress';
import { SimulationResults } from '@/components/research/simulation/SimulationResults';
import {
  createSimulation,
  SimulationConfig,
  SimulationResponse,
  QuestionsData,
  BusinessContext
} from '@/lib/api/simulation';
import {
  generateDashboardQuestions,
  downloadQuestions,
  type DashboardQuestionResponse
} from '@/lib/api/research-dashboard';

export default function ResearchDashboardPage() {
  const { context, questions, isLoading, generateQuestions, exportQuestions, loadSession } = useResearch();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<DashboardQuestionResponse | null>(null);

  // Simulation state
  const [showSimulationConfig, setShowSimulationConfig] = useState(false);
  const [showSimulationProgress, setShowSimulationProgress] = useState(false);
  const [simulationResults, setSimulationResults] = useState<SimulationResponse | null>(null);
  const [currentSimulationId, setCurrentSimulationId] = useState<string | null>(null);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig | null>(null);

  // Load context from localStorage on mount
  useEffect(() => {
    const loadLatestContext = async () => {
      try {
        // First check if there's a current session set from the research dashboard
        const currentSessionStr = localStorage.getItem('current_research_session');
        if (currentSessionStr) {
          const currentSession = JSON.parse(currentSessionStr);
          console.log('Loading current session from research dashboard:', currentSession);
          if (currentSession.session_id) {
            await loadSession(currentSession.session_id);
            return;
          }
        }

        // Fallback: Try to load the most recent session
        const sessions = JSON.parse(localStorage.getItem('research_sessions') || '[]');
        if (sessions.length > 0) {
          const latestSession = sessions[0];
          if (latestSession.session_id) {
            await loadSession(latestSession.session_id);
          }
        }
      } catch (error) {
        console.error('Failed to load research context:', error);
      }
    };

    loadLatestContext();
  }, [loadSession]);

  // Convert research helper questions to dashboard format when available
  useEffect(() => {
    if (questions && !generatedQuestions && context.questionsGenerated) {
      console.log('✅ Converting existing research questions to dashboard format');

      // Convert research helper format to dashboard format
      const dashboardFormat: DashboardQuestionResponse = {
        success: true,
        message: 'Questions loaded from research session',
        questions: {
          primaryStakeholders: [{
            name: 'Primary Stakeholder',
            description: 'Primary stakeholder from research session',
            questions: {
              problemDiscovery: questions.problemDiscovery || [],
              solutionValidation: questions.solutionValidation || [],
              followUp: questions.followUp || []
            }
          }],
          secondaryStakeholders: []
        },
        metadata: {
          total_questions: (questions.problemDiscovery?.length || 0) +
                          (questions.solutionValidation?.length || 0) +
                          (questions.followUp?.length || 0),
          generation_method: 'research_session',
          conversation_routine: true
        }
      };

      setGeneratedQuestions(dashboardFormat);
      console.log('🔄 Converted questions:', dashboardFormat);
    }
  }, [questions, generatedQuestions, context.questionsGenerated]);

  // Check if we have sufficient context for question generation
  const hasContext = context.businessIdea && context.targetCustomer && context.problem;
  const contextCompleteness = hasContext ? 100 :
    (context.businessIdea ? 33 : 0) +
    (context.targetCustomer ? 33 : 0) +
    (context.problem ? 34 : 0);

  const handleGenerateQuestions = async () => {
    if (!hasContext) return;

    setIsGenerating(true);
    try {
      const request = {
        business_idea: context.businessIdea || '',
        target_customer: context.targetCustomer || '',
        problem: context.problem || '',
        session_id: `dashboard-${Date.now()}`
      };

      const result = await generateDashboardQuestions(request);
      if (result.success) {
        setGeneratedQuestions(result);
      } else {
        console.error('Question generation failed:', result.message);
        // You might want to show an error toast here
      }
    } catch (error) {
      console.error('Failed to generate questions:', error);
      // You might want to show an error toast here
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportQuestions = async (format: 'txt' | 'json' | 'csv' = 'txt') => {
    if (generatedQuestions?.questions) {
      downloadQuestions(generatedQuestions.questions, format);
    }
  };

  // Simulation handlers
  const handleStartSimulation = () => {
    if (!generatedQuestions?.questions) {
      console.error('No questions available for simulation');
      return;
    }
    setShowSimulationConfig(true);
  };

  const handleConfigureSimulation = async (config: SimulationConfig) => {
    if (!generatedQuestions?.questions || !context.businessIdea) {
      console.error('Missing required data for simulation');
      return;
    }

    try {
      setSimulationConfig(config);
      setShowSimulationConfig(false);
      setShowSimulationProgress(true);

      // Debug: Log the generated questions structure
      console.log('🔍 Generated Questions Full Response:', generatedQuestions);
      console.log('🔍 Questions Object:', generatedQuestions.questions);
      console.log('🔍 Questions Structure Keys:', Object.keys(generatedQuestions.questions || {}));
      console.log('🔍 Primary Stakeholders:', generatedQuestions.questions?.primaryStakeholders);
      console.log('🔍 Secondary Stakeholders:', generatedQuestions.questions?.secondaryStakeholders);
      console.log('🔍 Stakeholders Object:', generatedQuestions.questions?.stakeholders);
      console.log('🔍 Metadata:', generatedQuestions.metadata);

      // Helper function to convert research helper stakeholder to simulation format
      const convertStakeholder = (stakeholder: any, index: number) => ({
        id: `${stakeholder.name.toLowerCase().replace(/\s+/g, '_')}_${index}`,
        name: stakeholder.name,
        description: stakeholder.description,
        // Flatten all question categories into a single array
        questions: [
          ...(stakeholder.questions?.problemDiscovery || []),
          ...(stakeholder.questions?.solutionValidation || []),
          ...(stakeholder.questions?.followUp || [])
        ]
      });

      // Handle different question structures - check both formats
      let primaryStakeholders = [];
      let secondaryStakeholders = [];

      if (generatedQuestions.questions?.primaryStakeholders) {
        // Format 1: Direct primaryStakeholders/secondaryStakeholders
        primaryStakeholders = generatedQuestions.questions.primaryStakeholders;
        secondaryStakeholders = generatedQuestions.questions.secondaryStakeholders || [];
      } else if (generatedQuestions.questions?.stakeholders) {
        // Format 2: Nested stakeholders object
        primaryStakeholders = generatedQuestions.questions.stakeholders.primary || [];
        secondaryStakeholders = generatedQuestions.questions.stakeholders.secondary || [];
      }

      console.log('🔍 Extracted Primary:', primaryStakeholders);
      console.log('🔍 Extracted Secondary:', secondaryStakeholders);

      // Convert questions to simulation format with proper structure mapping
      const questionsData: QuestionsData = {
        stakeholders: {
          primary: primaryStakeholders.map(convertStakeholder),
          secondary: secondaryStakeholders.map(convertStakeholder)
        },
        timeEstimate: {
          totalQuestions: generatedQuestions.metadata?.total_questions || 0
        }
      };

      console.log('🔍 Final Questions Data for Simulation:', questionsData);

      const businessContext: BusinessContext = {
        business_idea: context.businessIdea,
        target_customer: context.targetCustomer || '',
        problem: context.problem || '',
        industry: 'general'
      };

      const response = await createSimulation(questionsData, businessContext, config);

      if (response.success && response.simulation_id) {
        setCurrentSimulationId(response.simulation_id);
        setSimulationResults(response);
        // Hide progress modal and show results immediately since simulation completed
        setShowSimulationProgress(false);
        console.log('Simulation completed successfully:', response);
        console.log('Personas:', response.personas?.length || 0);
        console.log('Interviews:', response.interviews?.length || 0);
        console.log('Insights:', response.simulation_insights);
      } else {
        throw new Error(response.message || 'Simulation failed');
      }
    } catch (error) {
      console.error('Simulation failed:', error);
      setShowSimulationProgress(false);
      // You might want to show an error toast here
    }
  };

  const handleSimulationComplete = (simulationId: string) => {
    setShowSimulationProgress(false);
    // Results are already set in simulationResults state
  };

  const handleCancelSimulation = () => {
    setShowSimulationProgress(false);
    setCurrentSimulationId(null);
    setSimulationConfig(null);
  };

  const handleAnalyzeResults = () => {
    // Navigate to analysis with simulation data
    if (simulationResults?.data) {
      // Store simulation data for analysis
      localStorage.setItem('simulation_analysis_data', JSON.stringify(simulationResults.data));
      window.location.href = '/unified-dashboard/upload?source=simulation';
    }
  };

  const handleViewDetails = () => {
    // Show detailed simulation results
    console.log('View simulation details:', simulationResults);
  };

  const handleExportSimulationData = () => {
    if (simulationResults?.data) {
      const dataStr = JSON.stringify(simulationResults.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `simulation_${simulationResults.simulation_id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
            Research Dashboard
          </h1>
          <p className="text-muted-foreground">
            Generate and manage your customer research questions
          </p>

          {/* Workflow Status */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
              <div>
                <p className="text-green-800 font-medium text-sm">✅ Session Management Active</p>
                <p className="text-green-700 text-xs mt-1">
                  Your research sessions are now properly saved and can be continued from the{' '}
                  <button
                    onClick={() => window.location.href = '/research-dashboard'}
                    className="text-green-600 underline hover:text-green-800"
                  >
                    Sessions Dashboard
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Context & Chat */}
          <div className="lg:col-span-2 space-y-6">
            {/* Research Context */}
            <ResearchContextDisplay
              context={context}
              completeness={contextCompleteness}
            />

            {/* Embedded Chat Display */}
            {hasContext && (
              <EmbeddedChatDisplay context={context} />
            )}

            {/* No Context State */}
            {!hasContext && (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Research Context</h3>
                  <p className="text-muted-foreground mb-4">
                    Start a conversation in the Customer Research Helper to build your research context.
                  </p>
                  <Button
                    onClick={() => window.location.href = '/customer-research'}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Start Research Chat
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Question Generation */}
          <div className="space-y-6">
            <QuestionGenerationPanel
              hasContext={hasContext}
              contextCompleteness={contextCompleteness}
              isGenerating={isGenerating}
              generatedQuestions={generatedQuestions?.questions}
              onGenerateQuestions={handleGenerateQuestions}
              onExportQuestions={handleExportQuestions}
              onStartSimulation={handleStartSimulation}
            />

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    // If we have a current session, pass it to the chat
                    const currentSession = currentSessionData;
                    if (currentSession?.session_id) {
                      window.location.href = `/customer-research?session=${currentSession.session_id}`;
                    } else {
                      window.location.href = '/customer-research';
                    }
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Continue Research Chat
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.location.href = '/research-dashboard'}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  View All Sessions
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.location.href = '/unified-dashboard/upload'}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Upload Interview Data
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Simulation Modals */}
      <SimulationConfigModal
        isOpen={showSimulationConfig}
        onClose={() => setShowSimulationConfig(false)}
        onStartSimulation={handleConfigureSimulation}
        questionsData={{
          stakeholders: {
            primary: generatedQuestions?.questions?.primary_stakeholders || [],
            secondary: generatedQuestions?.questions?.secondary_stakeholders || []
          },
          timeEstimate: {
            totalQuestions: generatedQuestions?.questions?.total_questions || 0
          }
        }}
      />

      <SimulationProgress
        isVisible={showSimulationProgress}
        simulationId={currentSimulationId || undefined}
        onCancel={handleCancelSimulation}
        onComplete={handleSimulationComplete}
        simulationConfig={simulationConfig || undefined}
      />

      {simulationResults && (
        <SimulationResults
          simulationResponse={simulationResults}
          onAnalyzeResults={handleAnalyzeResults}
          onViewDetails={handleViewDetails}
          onExportData={handleExportSimulationData}
          onClose={() => {
            console.log('Closing simulation results');
            setSimulationResults(null);
          }}
        />
      )}
    </div>
  );
}
