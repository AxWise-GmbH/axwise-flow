'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Client-side timestamp component to avoid hydration errors
function ClientTimestamp({ timestamp, format = 'localeString' }: { timestamp: string; format?: 'localeString' | 'localeTimeString' | 'localeDateString' }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span>Loading...</span>;
  }

  const date = new Date(timestamp);

  // Debug: Check for invalid dates only
  const isInvalid = isNaN(date.getTime());

  if (isInvalid) {
    console.warn('Invalid timestamp detected:', timestamp);
    return <span className="text-red-500">Invalid date</span>;
  }

  // Log the actual date for debugging
  console.log('Displaying timestamp:', timestamp, '→', date.toLocaleDateString('en-GB'));

  if (format === 'localeTimeString') {
    return <span>{date.toLocaleTimeString('en-GB')}</span>;
  } else if (format === 'localeDateString') {
    // Use DD/MM/YYYY format as per user preferences
    return <span>{date.toLocaleDateString('en-GB')}</span>;
  } else {
    // Use DD/MM/YYYY format for full datetime
    return <span>{date.toLocaleString('en-GB')}</span>;
  }
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


import {
  Clock,
  MessageSquare,
  Calendar,
  Target,
  Users,
  Eye,
  ArrowRight,
  Plus,
  FileText,
  Download,
  Play,
  BarChart
} from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { getResearchSessions, type ResearchSession } from '@/lib/api/research';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export default function ResearchChatHistory() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [allSessions, setAllSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyWithQuestionnaires, setShowOnlyWithQuestionnaires] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [showQuestionnaireModal, setShowQuestionnaireModal] = useState(false);
  const [selectedQuestionnaireSession, setSelectedQuestionnaireSession] = useState<ResearchSession | null>(null);
  const [questionnaireData, setQuestionnaireData] = useState<any>(null);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(false);

  // Function to fix only truly corrupted (invalid) timestamps in localStorage
  const fixCorruptedTimestamps = () => {
    try {
      const stored = localStorage.getItem('axwise_research_sessions');
      if (!stored) return;

      const sessions = JSON.parse(stored);
      let hasChanges = false;
      const now = new Date().toISOString();

      const fixedSessions = sessions.map((session: any) => {
        const createdDate = new Date(session.created_at);
        const updatedDate = new Date(session.updated_at);

        // Only fix truly invalid dates (NaN), not past or future dates
        if (isNaN(createdDate.getTime())) {
          console.warn(`Fixing invalid created_at for session ${session.session_id}:`, session.created_at);
          session.created_at = now;
          hasChanges = true;
        }

        if (isNaN(updatedDate.getTime())) {
          console.warn(`Fixing invalid updated_at for session ${session.session_id}:`, session.updated_at);
          session.updated_at = now;
          hasChanges = true;
        }

        return session;
      });

      if (hasChanges) {
        localStorage.setItem('axwise_research_sessions', JSON.stringify(fixedSessions));
        console.log('✅ Fixed corrupted timestamps in localStorage');
        showToast('Fixed corrupted session timestamps', { variant: 'success' });
      } else {
        console.log('ℹ️ No corrupted timestamps found');
      }
    } catch (error) {
      console.error('Error fixing corrupted timestamps:', error);
    }
  };

  // Function to toggle between showing all sessions vs only those with questionnaires
  const toggleSessionFilter = () => {
    const newValue = !showOnlyWithQuestionnaires;
    setShowOnlyWithQuestionnaires(newValue);

    if (newValue) {
      // Show only sessions with questionnaires
      const sessionsWithQuestionnaires = allSessions.filter(session => {
        if (session.questions_generated) return true;

        if (session.messages && session.messages.length > 0) {
          const hasQuestionnaireMessage = session.messages.some(msg =>
            msg.metadata?.comprehensiveQuestions ||
            msg.metadata?.questionnaire ||
            (msg.role === 'assistant' && msg.content && msg.content.includes('questionnaire'))
          );
          if (hasQuestionnaireMessage) return true;
        }

        const hasBusinessIdea = session.business_idea && session.business_idea.trim().length > 0;
        const hasMessages = session.messages && session.messages.length > 1;
        return hasBusinessIdea && hasMessages;
      });
      setSessions(sessionsWithQuestionnaires);
    } else {
      // Show all sessions
      setSessions(allSessions);
    }
  };

  useEffect(() => {
    // Fix any corrupted timestamps before loading sessions
    fixCorruptedTimestamps();
    loadSessions();
  }, []);

  // Handle URL parameters for auto-opening questionnaire modal
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    const actionParam = searchParams.get('action');

    if (sessionParam && actionParam === 'view-questionnaire' && allSessions.length > 0) {
      const session = allSessions.find(s => s.session_id === sessionParam);
      if (session) {
        handleViewQuestionnaire(session);
        // Clean up URL parameters
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('session');
        newUrl.searchParams.delete('action');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [allSessions, searchParams]);

  // Calculate questionnaire stats when sessions change
  useEffect(() => {
    const calculateStats = async () => {
      const stats: Record<string, { questions: number; stakeholders: number }> = {};

      for (const session of sessions) {
        if (session.questions_generated) {
          // For local sessions, we need to get the full session data with messages
          if (session.session_id.startsWith('local_')) {
            try {
              // Import LocalResearchStorage dynamically
              const { LocalResearchStorage } = await import('@/lib/api/research');
              const fullSession = LocalResearchStorage.getSession(session.session_id);
              if (fullSession) {
                stats[session.session_id] = calculateQuestionnaireStats(fullSession);
              } else {
                stats[session.session_id] = { questions: 0, stakeholders: 0 };
              }
            } catch (error) {
              console.error(`Error loading local session ${session.session_id}:`, error);
              stats[session.session_id] = { questions: 0, stakeholders: 0 };
            }
          } else {
            // For backend sessions, use the session data we already have
            stats[session.session_id] = calculateQuestionnaireStats(session);
          }
        }
      }

      setQuestionnaireStats(stats);
    };

    if (sessions.length > 0) {
      calculateStats();
    }
  }, [sessions]);

  // Filter sessions based on stage and questionnaire filters
  useEffect(() => {
    let filtered = showOnlyWithQuestionnaires
      ? allSessions.filter(s => s.questions_generated)
      : allSessions;

    if (stageFilter !== 'all') {
      filtered = filtered.filter(session => {
        const stage = getSessionStage(session);
        return stage.id === stageFilter;
      });
    }

    setSessions(filtered);
  }, [allSessions, showOnlyWithQuestionnaires, stageFilter]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getResearchSessions(50);

      // Filter sessions to only show those with generated questionnaires
      const sessionsWithQuestionnaires = data.filter(session => {
        // Check if session has questions_generated flag set to true
        if (session.questions_generated) {
          return true;
        }

        // Also check if session has questionnaire messages
        if (session.messages && session.messages.length > 0) {
          const hasQuestionnaireMessage = session.messages.some(msg =>
            msg.metadata?.comprehensiveQuestions ||
            msg.metadata?.questionnaire ||
            (msg.role === 'assistant' && msg.content && msg.content.includes('questionnaire'))
          );
          if (hasQuestionnaireMessage) {
            return true;
          }
        }

        // Exclude empty sessions without business ideas or meaningful content
        const hasBusinessIdea = session.business_idea && session.business_idea.trim().length > 0;
        const hasMessages = session.messages && session.messages.length > 1; // More than just initial message

        return hasBusinessIdea && hasMessages;
      });

      console.log(`📊 Filtered sessions: ${data.length} total → ${sessionsWithQuestionnaires.length} with questionnaires`);

      // Store both filtered and unfiltered data
      setAllSessions(data);
      setSessions(showOnlyWithQuestionnaires ? sessionsWithQuestionnaires : data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };



  // Helper function to generate comprehensive questionnaire text
  const generateComprehensiveQuestionnaireText = (questionnaire: any, title: string): string => {
    let content = `# Research Questionnaire: ${title}\n\n`;
    content += `Generated on: ${new Date().toLocaleDateString('en-GB')}\n\n`;

    if (questionnaire.timeEstimate) {
      content += `## Time Estimate\n`;
      content += `Total Questions: ${questionnaire.timeEstimate.totalQuestions || 'N/A'}\n`;
      content += `Estimated Duration: ${questionnaire.timeEstimate.estimatedMinutes || 'N/A'}\n\n`;
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

  // State to store questionnaire stats for each session
  const [questionnaireStats, setQuestionnaireStats] = useState<Record<string, { questions: number; stakeholders: number }>>({});

  // Helper function to calculate questionnaire stats from session data
  const calculateQuestionnaireStats = (session: ResearchSession) => {
    if (!session?.messages) return { questions: 0, stakeholders: 0 };

    try {
      // Use the same detection logic as other components
      const questionnaireMessages = session.messages.filter((msg: any) =>
        msg.metadata?.comprehensiveQuestions ||
        (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
      );

      if (questionnaireMessages.length === 0) {
        return { questions: 0, stakeholders: 0 };
      }

      // Get the most recent questionnaire message
      const questionnaireMessage = questionnaireMessages.sort((a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      if (!questionnaireMessage?.metadata?.comprehensiveQuestions) {
        return { questions: 0, stakeholders: 0 };
      }

      const questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
      const primaryStakeholders = questionnaire.primaryStakeholders || [];
      const secondaryStakeholders = questionnaire.secondaryStakeholders || [];
      const allStakeholders = [...primaryStakeholders, ...secondaryStakeholders];

      // Count total questions across all categories
      const totalQuestions = allStakeholders.reduce((total: number, stakeholder: any) => {
        const questions = stakeholder.questions || {};
        return total +
          (questions.problemDiscovery?.length || 0) +
          (questions.solutionValidation?.length || 0) +
          (questions.followUp?.length || 0);
      }, 0);

      return {
        questions: totalQuestions,
        stakeholders: allStakeholders.length
      };
    } catch (error) {
      console.error('Error calculating questionnaire stats:', error);
      return { questions: 0, stakeholders: 0 };
    }
  };

  // Helper function to get questionnaire stats (now uses pre-calculated state)
  const getQuestionnaireStats = (sessionId: string) => {
    return questionnaireStats[sessionId] || { questions: 0, stakeholders: 0 };
  };

  // Handle viewing questionnaire in modal
  const handleViewQuestionnaire = async (session: ResearchSession) => {
    setSelectedQuestionnaireSession(session);
    setLoadingQuestionnaire(true);
    setShowQuestionnaireModal(true);

    try {
      let questionnaire = null;

      if (session.session_id.startsWith('local_')) {
        // Handle local session
        if (typeof window !== 'undefined') {
          const { LocalResearchStorage } = await import('@/lib/api/research');
          const localSession = LocalResearchStorage.getSession(session.session_id);

          if (localSession?.messages) {
            // Use the same detection logic as other components
            const questionnaireMessage = localSession.messages.find((msg: any) =>
              msg.metadata?.comprehensiveQuestions ||
              (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
            );

            if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
              questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
              console.log('📋 Modal: Found questionnaire data:', questionnaire);
              console.log('📋 Modal: Primary stakeholders:', questionnaire.primaryStakeholders?.length || 0);
              console.log('📋 Modal: Secondary stakeholders:', questionnaire.secondaryStakeholders?.length || 0);
            } else {
              console.warn('📋 Modal: No questionnaire message found for session:', session.session_id);
            }
          }
        }
      } else {
        // Handle backend session
        const response = await fetch(`/api/research/sessions/${session.session_id}/questionnaire`);
        if (response.ok) {
          const data = await response.json();
          questionnaire = data.questionnaire;
        }
      }

      setQuestionnaireData(questionnaire);
    } catch (error) {
      console.error('Error loading questionnaire:', error);
      showToast('Failed to load questionnaire', { variant: 'error' });
    } finally {
      setLoadingQuestionnaire(false);
    }
  };

  // Handle downloading questionnaire
  const handleDownloadQuestionnaire = async (sessionId: string, title: string) => {
    try {
      console.log('📥 Downloading questionnaire for session:', sessionId);

      let questionnaire = null;

      if (sessionId.startsWith('local_')) {
        // Handle local session
        if (typeof window !== 'undefined') {
          const { LocalResearchStorage } = await import('@/lib/api/research');
          const session = LocalResearchStorage.getSession(sessionId);

          if (session?.messages) {
            // Use the same detection logic as other components
            const questionnaireMessage = session.messages.find((msg: any) =>
              msg.metadata?.comprehensiveQuestions ||
              (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
            );

            if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
              questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
              console.log('📋 Local questionnaire data for download:', questionnaire);
            }
          }
        }
      } else {
        // Handle backend session
        const response = await fetch(`/api/research/sessions/${sessionId}/questionnaire`);

        if (response.ok) {
          const data = await response.json();
          questionnaire = data.questionnaire;
          console.log('📋 Backend questionnaire data for download:', questionnaire);
        } else {
          const errorText = await response.text();
          console.error('❌ Download failed:', response.status, errorText);
          showToast(`Failed to download questionnaire: ${response.status}`, { variant: 'error' });
          return;
        }
      }

      if (questionnaire) {
        // V3 Enhanced format only - validate structure
        if (!questionnaire.primaryStakeholders && !questionnaire.secondaryStakeholders) {
          throw new Error('Invalid questionnaire format - V3 Enhanced format required');
        }

        // Generate V3 Enhanced format
        const textContent = generateComprehensiveQuestionnaireText(questionnaire, title);

        // Create and download the file
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
      } else {
        showToast('No questionnaire data found for this session', { variant: 'error' });
      }
    } catch (error) {
      console.error('❌ Download error:', error);
      showToast('Failed to download questionnaire', { variant: 'error' });
    }
  };



  // Workflow stage logic
  interface SessionStage {
    id: 'in-progress' | 'questionnaire-ready' | 'simulation-complete';
    label: string;
    description: string;
    questionnaire: boolean;
    simulation: boolean;
    nextActions: string[];
  }

  const getSessionStage = (session: ResearchSession): SessionStage => {
    // Check if simulation is complete (check localStorage for simulation results)
    const simulationResults = JSON.parse(localStorage.getItem('simulation_results') || '[]');
    const hasSimulationResults = simulationResults.some((sim: any) =>
      sim.source_session_id === session.session_id ||
      sim.metadata?.source_session_id === session.session_id
    );

    if (hasSimulationResults) {
      return {
        id: 'simulation-complete',
        label: 'Simulation Complete',
        description: 'Ready for analysis',
        questionnaire: true,
        simulation: true,
        nextActions: ['View Results', 'Download', 'Analyze']
      };
    }

    // Check if questionnaire is generated
    if (session.questions_generated) {
      return {
        id: 'questionnaire-ready',
        label: 'Ready for Simulation',
        description: 'Questionnaire generated',
        questionnaire: true,
        simulation: false,
        nextActions: ['View Questions', 'Start Simulation', 'Continue Chat']
      };
    }

    // Still in progress
    return {
      id: 'in-progress',
      label: 'In Progress',
      description: 'Building research context',
      questionnaire: false,
      simulation: false,
      nextActions: ['Continue Chat']
    };
  };

  // Workflow stage indicator component
  const WorkflowStageIndicator = ({ stage }: { stage: SessionStage }) => {
    const stageConfig = {
      'in-progress': { color: 'bg-yellow-100 text-yellow-800', icon: '🔄' },
      'questionnaire-ready': { color: 'bg-blue-100 text-blue-800', icon: '📋' },
      'simulation-complete': { color: 'bg-green-100 text-green-800', icon: '✅' }
    };

    const config = stageConfig[stage.id];

    return (
      <Badge className={`text-xs ${config.color}`}>
        <span className="mr-1">{config.icon}</span>
        {stage.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading research chat history...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Research History</h1>
        <p className="text-muted-foreground mt-2">
          {showOnlyWithQuestionnaires
            ? 'Showing research sessions that have generated questionnaires'
            : 'View and manage all your research chat conversations and generated questionnaires'
          }
        </p>

        {/* Enhanced Filter Controls */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="questionnaire-filter"
                    checked={showOnlyWithQuestionnaires}
                    onChange={toggleSessionFilter}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="questionnaire-filter" className="text-sm font-medium">
                    Show only sessions with questionnaires
                  </label>
                </div>

                {/* Stage-based filter */}
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="questionnaire-ready">Ready for Simulation</SelectItem>
                    <SelectItem value="simulation-complete">Simulation Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground">
                Showing {sessions.length} of {allSessions.length} sessions
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 mt-4">
          <Button
            onClick={() => {
              localStorage.removeItem('current_research_session');
              window.location.href = '/unified-dashboard/research-chat';
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Start New Research Chat
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/unified-dashboard/research'}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Go to Interview Simulation
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              fixCorruptedTimestamps();
              loadSessions();
            }}
            className="text-amber-600 hover:text-amber-700"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Fix Timestamps
          </Button>
        </div>
      </div>

      {/* Single Unified Session List */}
      <div className="max-w-6xl mx-auto mt-6">
        {/* Sessions List */}
        <div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Research Sessions
              </CardTitle>
              <CardDescription>
                Your research journey from idea to analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {sessions.map((session) => {
                  const stage = getSessionStage(session);
                  const stats = getQuestionnaireStats(session.session_id);

                  return (
                    <Card
                      key={session.session_id}
                      className="transition-all hover:shadow-md"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {/* Business Idea Title */}
                            <h3 className="font-medium truncate mb-2">
                              {session.business_idea || 'Untitled Research Session'}
                            </h3>

                            {/* Workflow Stage Indicator */}
                            <div className="flex items-center gap-2 mb-3">
                              <WorkflowStageIndicator stage={stage} />
                              <Badge variant="outline" className="text-xs">
                                {session.industry}
                              </Badge>
                            </div>

                            {/* Progress Information */}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {session.message_count || session.messages?.length || 0} messages
                              </span>

                              {stage.questionnaire && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {stats.questions} questions, {stats.stakeholders} stakeholders
                                </span>
                              )}

                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <ClientTimestamp timestamp={session.updated_at || session.created_at} format="localeDateString" />
                              </span>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 ml-4">
                            {/* Always show continue chat */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/unified-dashboard/research-chat?session=${session.session_id}`);
                              }}
                              title="Continue conversation"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>

                            {/* Action buttons */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/unified-dashboard/research-chat?session=${session.session_id}`);
                              }}
                              title="Continue conversation"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>

                            {/* Show questionnaire actions if available */}
                            {stage.questionnaire && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewQuestionnaire(session);
                                  }}
                                  title="View questionnaire"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadQuestionnaire(session.session_id, session.business_idea || 'questionnaire');
                                  }}
                                  title="Download questionnaire"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>

                                {!stage.simulation && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/unified-dashboard/research?session=${session.session_id}`);
                                    }}
                                    title="Start AI simulation"
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}

                            {/* Show results if simulation complete */}
                            {stage.simulation && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/unified-dashboard/simulation-history`);
                                }}
                                title="View simulation results"
                              >
                                <BarChart className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {sessions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No research chat sessions yet</p>
                    <p className="text-sm">Start a research chat to create your first session</p>
                    <Button
                      className="mt-4"
                      onClick={() => window.location.href = '/unified-dashboard/research-chat'}
                    >
                      Start Research Chat
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Questionnaire Modal */}
      <Dialog open={showQuestionnaireModal} onOpenChange={setShowQuestionnaireModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedQuestionnaireSession?.business_idea || 'Research Questionnaire'}
            </DialogTitle>
            <DialogDescription>
              Generated questionnaire for customer research and validation
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {loadingQuestionnaire ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading questionnaire...</span>
              </div>
            ) : questionnaireData ? (
              <div className="space-y-6">
                {/* Business Context */}
                {selectedQuestionnaireSession && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Business Context</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>Business Idea:</strong> {selectedQuestionnaireSession.business_idea}</p>
                      {selectedQuestionnaireSession.target_customer && (
                        <p><strong>Target Customer:</strong> {selectedQuestionnaireSession.target_customer}</p>
                      )}
                      {selectedQuestionnaireSession.problem && (
                        <p><strong>Problem:</strong> {selectedQuestionnaireSession.problem}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Primary Stakeholders */}
                {questionnaireData.primaryStakeholders && questionnaireData.primaryStakeholders.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      Primary Stakeholders
                    </h3>
                    <div className="space-y-4">
                      {questionnaireData.primaryStakeholders.map((stakeholder: any, index: number) => (
                        <div key={index} className="border-l-4 border-primary pl-4">
                          <h4 className="font-semibold mb-1">{stakeholder.name}</h4>
                          <p className="text-sm text-muted-foreground mb-3">{stakeholder.description}</p>

                          {/* Problem Discovery Questions */}
                          {stakeholder.questions?.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0 && (
                            <div className="mb-3">
                              <h5 className="font-medium text-sm mb-2 text-blue-600">Problem Discovery</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.problemDiscovery.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Solution Validation Questions */}
                          {stakeholder.questions?.solutionValidation && stakeholder.questions.solutionValidation.length > 0 && (
                            <div className="mb-3">
                              <h5 className="font-medium text-sm mb-2 text-green-600">Solution Validation</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.solutionValidation.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Follow-up Questions */}
                          {stakeholder.questions?.followUp && stakeholder.questions.followUp.length > 0 && (
                            <div>
                              <h5 className="font-medium text-sm mb-2 text-purple-600">Follow-up</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.followUp.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Secondary Stakeholders */}
                {questionnaireData.secondaryStakeholders && questionnaireData.secondaryStakeholders.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-purple-600" />
                      Secondary Stakeholders
                    </h3>
                    <div className="space-y-4">
                      {questionnaireData.secondaryStakeholders.map((stakeholder: any, index: number) => (
                        <div key={index} className="border-l-4 border-purple-200 pl-4">
                          <h4 className="font-semibold mb-1">{stakeholder.name}</h4>
                          <p className="text-sm text-muted-foreground mb-3">{stakeholder.description}</p>

                          {/* Problem Discovery Questions */}
                          {stakeholder.questions?.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0 && (
                            <div className="mb-3">
                              <h5 className="font-medium text-sm mb-2 text-blue-600">Problem Discovery</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.problemDiscovery.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Solution Validation Questions */}
                          {stakeholder.questions?.solutionValidation && stakeholder.questions.solutionValidation.length > 0 && (
                            <div className="mb-3">
                              <h5 className="font-medium text-sm mb-2 text-green-600">Solution Validation</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.solutionValidation.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Follow-up Questions */}
                          {stakeholder.questions?.followUp && stakeholder.questions.followUp.length > 0 && (
                            <div>
                              <h5 className="font-medium text-sm mb-2 text-purple-600">Follow-up</h5>
                              <div className="space-y-1">
                                {stakeholder.questions.followUp.map((question: string, qIndex: number) => (
                                  <div key={qIndex} className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs mt-1">{qIndex + 1}.</span>
                                    <p className="text-sm">{question}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No questionnaire data found</p>
              </div>
            )}
          </ScrollArea>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {questionnaireData && selectedQuestionnaireSession && (
                <>
                  {(() => {
                    const primaryCount = questionnaireData.primaryStakeholders?.length || 0;
                    const secondaryCount = questionnaireData.secondaryStakeholders?.length || 0;
                    const totalStakeholders = primaryCount + secondaryCount;

                    const allStakeholders = [
                      ...(questionnaireData.primaryStakeholders || []),
                      ...(questionnaireData.secondaryStakeholders || [])
                    ];

                    const totalQuestions = allStakeholders.reduce((total: number, stakeholder: any) => {
                      const questions = stakeholder.questions || {};
                      return total +
                        (questions.problemDiscovery?.length || 0) +
                        (questions.solutionValidation?.length || 0) +
                        (questions.followUp?.length || 0);
                    }, 0);

                    return `${totalStakeholders} stakeholder groups • ${totalQuestions} questions`;
                  })()}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => selectedQuestionnaireSession && handleDownloadQuestionnaire(
                  selectedQuestionnaireSession.session_id,
                  selectedQuestionnaireSession.business_idea || 'questionnaire'
                )}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                onClick={() => {
                  setShowQuestionnaireModal(false);
                  if (selectedQuestionnaireSession) {
                    router.push(`/unified-dashboard/research?session=${selectedQuestionnaireSession.session_id}`);
                  }
                }}
              >
                <Play className="mr-2 h-4 w-4" />
                Start AI Simulation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
