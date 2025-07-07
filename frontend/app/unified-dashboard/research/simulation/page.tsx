'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SimulationChatInterface } from '@/components/research/SimulationChatInterface';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertCircle, FileText, Users } from 'lucide-react';
import {
  QuestionsData,
  BusinessContext,
  SimulationResponse
} from '@/lib/api/simulation';

interface QuestionnaireSession {
  session_id: string;
  title: string;
  question_count?: number;
  stakeholder_count?: number;
  questionnaire_generated_at?: string;
  questionnaire_exported?: boolean;
}

export default function SimulationChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [questionsData, setQuestionsData] = useState<QuestionsData | null>(null);
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sessionParam = searchParams.get('session');
    const fileParam = searchParams.get('file');

    if (sessionParam) {
      setSessionId(sessionParam);
      loadSessionData(sessionParam);
    } else if (fileParam) {
      // Handle file-based simulation (from uploaded questionnaire)
      loadFileData(fileParam);
    } else {
      setError('No questionnaire data provided. Please select a questionnaire from the research dashboard.');
      setIsLoading(false);
    }
  }, [searchParams]);

  const loadSessionData = async (sessionId: string) => {
    try {
      setIsLoading(true);

      // Check if it's a local session first
      if (sessionId.startsWith('local_')) {
        // Import LocalResearchStorage dynamically to avoid SSR issues
        const { LocalResearchStorage } = await import('@/lib/api/research');
        const sessionData = LocalResearchStorage.getSession(sessionId);

        if (!sessionData) {
          setError('Session not found in localStorage.');
          return;
        }

        console.log('📋 Loading session data:', sessionData);

        // Look for questionnaire data in messages
        const questionnaireMessage = sessionData.messages?.find((msg: any) =>
          msg.metadata?.comprehensiveQuestions
        );

        if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
          const comprehensiveQuestions = questionnaireMessage.metadata.comprehensiveQuestions;
          console.log('📋 Found comprehensive questions:', comprehensiveQuestions);

          // Transform the data to match the expected format
          const questionsData: QuestionsData = {
            stakeholders: {
              primary: (comprehensiveQuestions.primaryStakeholders || []).map((stakeholder: any) => ({
                id: stakeholder.id || stakeholder.name || 'primary_stakeholder',
                name: stakeholder.name || 'Primary Stakeholder',
                description: stakeholder.description || '',
                questions: [
                  ...(stakeholder.questions?.problemDiscovery || []),
                  ...(stakeholder.questions?.solutionValidation || []),
                  ...(stakeholder.questions?.followUp || [])
                ]
              })),
              secondary: (comprehensiveQuestions.secondaryStakeholders || []).map((stakeholder: any) => ({
                id: stakeholder.id || stakeholder.name || 'secondary_stakeholder',
                name: stakeholder.name || 'Secondary Stakeholder',
                description: stakeholder.description || '',
                questions: [
                  ...(stakeholder.questions?.problemDiscovery || []),
                  ...(stakeholder.questions?.solutionValidation || []),
                  ...(stakeholder.questions?.followUp || [])
                ]
              }))
            },
            timeEstimate: comprehensiveQuestions.timeEstimate
          };

          const businessContext: BusinessContext = {
            business_idea: sessionData.business_idea || 'Unknown business idea',
            target_customer: sessionData.target_customer || 'Unknown target customer',
            problem: sessionData.problem || 'Unknown problem',
            industry: sessionData.industry || 'general'
          };

          console.log('✅ Transformed questions data:', questionsData);
          console.log('✅ Business context:', businessContext);

          setQuestionsData(questionsData);
          setBusinessContext(businessContext);
        } else {
          setError('This session does not have generated questionnaires. Please generate questionnaires first.');
        }
      } else {
        // Load from backend API
        const response = await fetch(`/api/research/sessions/${sessionId}/questionnaire`);
        if (!response.ok) {
          throw new Error('Failed to load questionnaire from backend session');
        }

        const sessionData = await response.json();
        setQuestionsData(sessionData.questionnaire_data);
        setBusinessContext(sessionData.business_context);
      }
    } catch (error) {
      console.error('Error loading session data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load session data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileData = async (fileName: string) => {
    try {
      setIsLoading(true);
      // This would be implemented if we support file-based simulation
      // For now, redirect back to research dashboard
      setError('File-based simulation not yet implemented. Please use questionnaires from Research Chat.');
    } catch (error) {
      console.error('Error loading file data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load file data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulationComplete = (results: SimulationResponse) => {
    // Store results in localStorage for later access
    const simulationResults = {
      simulation_id: results.simulation_id,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      results: results
    };

    const existingResults = JSON.parse(localStorage.getItem('simulation_results') || '[]');
    existingResults.push(simulationResults);
    localStorage.setItem('simulation_results', JSON.stringify(existingResults));

    // Navigate to results or analysis page
    router.push(`/unified-dashboard/research?simulation=${results.simulation_id}`);
  };

  const handleBack = () => {
    router.push('/unified-dashboard/research');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading questionnaire data...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Error Loading Simulation
              </CardTitle>
              <CardDescription>
                There was a problem loading the questionnaire data for simulation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Research Dashboard
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!questionsData || !businessContext) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                No Questionnaire Data
              </CardTitle>
              <CardDescription>
                No questionnaire data found for simulation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Please select a questionnaire from the research dashboard or generate one in Research Chat first.
              </p>
              <Button onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Research Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)]">
      <SimulationChatInterface
        questionsData={questionsData}
        businessContext={businessContext}
        onComplete={handleSimulationComplete}
        onBack={handleBack}
      />
    </div>
  );
}
