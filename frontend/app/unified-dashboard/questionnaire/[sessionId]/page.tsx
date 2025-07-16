'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Download,
  FileText,
  Users,
  Clock,
  Target,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

interface QuestionnaireData {
  primaryStakeholders?: any[];
  secondaryStakeholders?: any[];
  timeEstimate?: {
    totalQuestions: number;
    estimatedMinutes: number;
  };
  metadata?: any;
}

interface SessionData {
  session_id: string;
  business_idea?: string;
  target_customer?: string;
  problem?: string;
  industry?: string;
  created_at: string;
  questions_generated: boolean;
}

export default function QuestionnaireDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const sessionId = params.sessionId as string;

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load questionnaire data
  const loadQuestionnaire = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let questionnaireData = null;
      let sessionInfo = null;

      if (sessionId.startsWith('local_')) {
        // Handle local session
        if (typeof window !== 'undefined') {
          const { LocalResearchStorage } = await import('@/lib/api/research');
          const session = LocalResearchStorage.getSession(sessionId);

          if (session?.messages) {
            const questionnaireMessage = session.messages.find((msg: any) =>
              msg.metadata?.comprehensiveQuestions
            );

            if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
              questionnaireData = questionnaireMessage.metadata.comprehensiveQuestions;
            }
          }

          sessionInfo = session;
        }
      } else {
        // Handle backend session
        try {
          const response = await fetch(`/api/research/sessions/${sessionId}/questionnaire`);
          if (response.ok) {
            const data = await response.json();
            questionnaireData = data.questionnaire;
          }

          // Also fetch session info
          const sessionResponse = await fetch(`/api/research/sessions/${sessionId}`);
          if (sessionResponse.ok) {
            sessionInfo = await sessionResponse.json();
          }
        } catch (fetchError) {
          console.error('Error fetching questionnaire:', fetchError);
        }
      }

      if (!questionnaireData) {
        throw new Error('No questionnaire found for this session');
      }

      setQuestionnaire(questionnaireData);
      setSessionData(sessionInfo);
    } catch (err) {
      console.error('Error loading questionnaire:', err);
      setError(err instanceof Error ? err.message : 'Failed to load questionnaire');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadQuestionnaire();
  }, [loadQuestionnaire]);

  // Helper function to extract numeric minutes from various formats
  const getEstimatedMinutes = (estimatedMinutes: any): number => {
    if (typeof estimatedMinutes === 'number') {
      return estimatedMinutes;
    }
    if (typeof estimatedMinutes === 'string') {
      // Handle formats like "60-70" or "65"
      const match = estimatedMinutes.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  };

  // Generate comprehensive questionnaire text for download
  const generateComprehensiveQuestionnaireText = (questionnaire: QuestionnaireData, title: string): string => {
    let content = `# Research Questionnaire: ${title}\n\n`;
    content += `Generated on: ${new Date().toLocaleDateString()}\n\n`;

    if (questionnaire.timeEstimate) {
      content += `## Time Estimate\n`;
      content += `Total Questions: ${questionnaire.timeEstimate.totalQuestions || 'N/A'}\n`;
      content += `Estimated Duration: ${questionnaire.timeEstimate.estimatedMinutes || 'N/A'} minutes\n\n`;
    }

    // Primary Stakeholders
    if (questionnaire.primaryStakeholders && questionnaire.primaryStakeholders.length > 0) {
      content += `## Primary Stakeholders\n\n`;
      questionnaire.primaryStakeholders.forEach((stakeholder: any, index: number) => {
        content += `### ${index + 1}. ${stakeholder.name}\n`;
        if (stakeholder.description) {
          content += `**Description:** ${stakeholder.description}\n\n`;
        }

        if (stakeholder.questions) {
          if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
            content += `**Problem Discovery Questions:**\n`;
            stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
            content += `**Solution Validation Questions:**\n`;
            stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
            content += `**Follow-up Questions:**\n`;
            stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }
        }
        content += `---\n\n`;
      });
    }

    // Secondary Stakeholders
    if (questionnaire.secondaryStakeholders && questionnaire.secondaryStakeholders.length > 0) {
      content += `## Secondary Stakeholders\n\n`;
      questionnaire.secondaryStakeholders.forEach((stakeholder: any, index: number) => {
        content += `### ${index + 1}. ${stakeholder.name}\n`;
        if (stakeholder.description) {
          content += `**Description:** ${stakeholder.description}\n\n`;
        }

        if (stakeholder.questions) {
          if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
            content += `**Problem Discovery Questions:**\n`;
            stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
            content += `**Solution Validation Questions:**\n`;
            stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
            content += `**Follow-up Questions:**\n`;
            stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }
        }
        content += `---\n\n`;
      });
    }

    content += `\nGenerated by AxWise Customer Research Assistant\nReady for simulation bridge and interview analysis`;
    return content;
  };

  // Handle downloading questionnaire
  const handleDownload = async () => {
    if (!questionnaire || !sessionData) return;

    try {
      const title = sessionData.business_idea || 'questionnaire';
      const textContent = generateComprehensiveQuestionnaireText(questionnaire, title);

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questionnaire-${title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast('Questionnaire downloaded successfully', { variant: 'success' });
    } catch (error) {
      console.error('Download error:', error);
      showToast('Failed to download questionnaire', { variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading questionnaire...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">Questionnaire Not Found</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => router.push('/unified-dashboard/research-chat-history?tab=questionnaires')}>
                View All Questionnaires
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Research History
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              {sessionData?.business_idea || 'Research Questionnaire'}
            </h1>
            <p className="text-muted-foreground">
              Generated questionnaire for customer research and validation
            </p>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="outline"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button
              onClick={() => router.push(`/unified-dashboard/research?session=${sessionId}`)}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Run Simulation
            </Button>
          </div>
        </div>
      </div>

      {/* Session Info */}
      {sessionData && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Business Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessionData.business_idea && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Business Idea</h4>
                  <p className="text-sm text-muted-foreground">{sessionData.business_idea}</p>
                </div>
              )}
              {sessionData.target_customer && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Target Customer</h4>
                  <p className="text-sm text-muted-foreground">{sessionData.target_customer}</p>
                </div>
              )}
              {sessionData.problem && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Problem</h4>
                  <p className="text-sm text-muted-foreground">{sessionData.problem}</p>
                </div>
              )}
              <div>
                <h4 className="font-medium text-sm mb-1">Industry</h4>
                <Badge variant="outline">{sessionData.industry || 'General'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time Estimate */}
      {questionnaire?.timeEstimate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Time Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {questionnaire.timeEstimate.totalQuestions || 0}
                </div>
                <div className="text-sm text-muted-foreground">Total Questions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {getEstimatedMinutes(questionnaire.timeEstimate.estimatedMinutes)}
                </div>
                <div className="text-sm text-muted-foreground">Estimated Minutes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary Stakeholders */}
      {questionnaire?.primaryStakeholders && questionnaire.primaryStakeholders.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Primary Stakeholders
            </CardTitle>
            <CardDescription>
              Key stakeholders who are essential for your business success
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {questionnaire.primaryStakeholders.map((stakeholder: any, index: number) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{stakeholder.name}</h3>
                      {stakeholder.description && (
                        <p className="text-muted-foreground text-sm mt-1">{stakeholder.description}</p>
                      )}
                    </div>
                    <Badge variant="default">Primary</Badge>
                  </div>

                  {stakeholder.questions && (
                    <div className="space-y-4">
                      {stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                            Problem Discovery Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.problemDiscovery.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            Solution Validation Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.solutionValidation.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-purple-600" />
                            Follow-up Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.followUp.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary Stakeholders */}
      {questionnaire?.secondaryStakeholders && questionnaire.secondaryStakeholders.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Secondary Stakeholders
            </CardTitle>
            <CardDescription>
              Additional stakeholders who may provide valuable insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {questionnaire.secondaryStakeholders.map((stakeholder: any, index: number) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{stakeholder.name}</h3>
                      {stakeholder.description && (
                        <p className="text-muted-foreground text-sm mt-1">{stakeholder.description}</p>
                      )}
                    </div>
                    <Badge variant="secondary">Secondary</Badge>
                  </div>

                  {stakeholder.questions && (
                    <div className="space-y-4">
                      {stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                            Problem Discovery Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.problemDiscovery.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            Solution Validation Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.solutionValidation.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-purple-600" />
                            Follow-up Questions
                          </h4>
                          <div className="space-y-2">
                            {stakeholder.questions.followUp.map((question: string, qIndex: number) => (
                              <div key={qIndex} className="flex gap-3 text-sm">
                                <span className="text-muted-foreground font-mono">{qIndex + 1}.</span>
                                <span>{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold mb-1">Ready to conduct interviews?</h3>
              <p className="text-sm text-muted-foreground">
                Use this questionnaire for manual interviews or run AI-powered simulations
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleDownload}
              >
                <Download className="mr-2 h-4 w-4" />
                Download TXT
              </Button>
              <Button
                onClick={() => router.push(`/unified-dashboard/research?session=${sessionId}`)}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Run AI Simulation
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
